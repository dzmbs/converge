import {
	bytesToHex,
	consensusMedianAggregation,
	cre,
	getNetwork,
	prepareReportRequest,
	encodeCallMsg,
	TxStatus,
	type Runtime,
	type HTTPSendRequester,
} from '@chainlink/cre-sdk'
import {
	type Address,
	type Hex,
	encodeAbiParameters,
	encodeFunctionData,
	decodeFunctionResult,
} from 'viem'
import { z } from 'zod'
import { CREOracleAbi } from '../../contracts/abi/CREOracle'

// ─── Config ────────────────────────────────────────────────────────────

export const configSchema = z.object({
	schedule: z.string(),
	issuerApiUrl: z.string(),
	deviationThresholdBips: z.number(),
	evms: z.array(
		z.object({
			chainSelectorName: z.string(),
			oracleAddress: z.string(),
		}),
	),
})

type Config = z.infer<typeof configSchema>

// ─── Helpers ───────────────────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/**
 * Fetches the current NAV rate from the issuer API.
 * Each DON node calls this independently; results are aggregated via median.
 */
const fetchIssuerRate = (
	sendRequester: HTTPSendRequester,
	config: Config,
): number => {
	const response = sendRequester
		.sendRequest({
			url: config.issuerApiUrl,
			method: 'GET',
		})
		.result()

	if (response.statusCode < 200 || response.statusCode >= 300) {
		throw new Error(`Issuer API request failed with status ${response.statusCode}`)
	}

	const body = new TextDecoder().decode(response.body)

	// Parse response — supports RedStone API format:
	// RedStone returns: [{ symbol, value, source, timestamp, ... }]
	try {
		const parsed = JSON.parse(body)

		// RedStone array format: [{ value: N, source: { "securitize-api": N } }]
		if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].value === 'number') {
			return parsed[0].value
		}

		// Fallback: direct object with value/rate/nav/price
		const rate = parsed.value ?? parsed.rate ?? parsed.nav ?? parsed.price
		if (typeof rate === 'number' && !isNaN(rate)) return rate

		throw new Error(`Could not parse rate from response: ${body}`)
	} catch (e) {
		if (e instanceof SyntaxError) {
			const rate = Number.parseFloat(body)
			if (!isNaN(rate)) return rate
		}
		throw e
	}
}

/** Converts a float rate (e.g. 1.0023) to 18-decimal fixed point. */
function rateToFixed(rate: number): bigint {
	return BigInt(Math.round(rate * 1e18))
}

/** Checks if deviation between old and new rate exceeds threshold in bips. */
function deviationExceeds(oldRate: bigint, newRate: bigint, thresholdBips: number): boolean {
	if (oldRate === 0n) return true
	const diff = newRate > oldRate ? newRate - oldRate : oldRate - newRate
	return diff * 10_000n > oldRate * BigInt(thresholdBips)
}

// ─── Workflow ──────────────────────────────────────────────────────────

/** Updates oracle on a single chain. Returns a status string. */
function updateChain(
	runtime: Runtime<Config>,
	evmConfig: Config['evms'][number],
	newRateFixed: bigint,
	fetchedRate: number,
): string {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: evmConfig.chainSelectorName,
		isTestnet: true,
	})
	if (!network) {
		runtime.log(`Network not found: ${evmConfig.chainSelectorName}, skipping`)
		return `${evmConfig.chainSelectorName}: skipped (network not found)`
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

	// Read current on-chain rate
	let currentRate = 0n
	try {
		const rateCalldata = encodeFunctionData({
			abi: CREOracleAbi,
			functionName: 'rateWithTimestamp',
		})

		const onChainResult = evmClient
			.callContract(runtime, {
				call: encodeCallMsg({
					from: ZERO_ADDRESS,
					to: evmConfig.oracleAddress as Address,
					data: rateCalldata,
				}),
			})
			.result()

		const hexData = bytesToHex(onChainResult.data)
		if (hexData !== '0x' && hexData.length > 2) {
			const [rate] = decodeFunctionResult({
				abi: CREOracleAbi,
				functionName: 'rateWithTimestamp',
				data: hexData,
			}) as [bigint, bigint]
			currentRate = rate
		}
	} catch {
		runtime.log(`[${evmConfig.chainSelectorName}] Could not read on-chain rate`)
	}

	runtime.log(`[${evmConfig.chainSelectorName}] Current on-chain rate: ${currentRate.toString()}`)

	// Check deviation threshold
	if (!deviationExceeds(currentRate, newRateFixed, runtime.config.deviationThresholdBips)) {
		runtime.log(`[${evmConfig.chainSelectorName}] Below threshold, skipping`)
		return `${evmConfig.chainSelectorName}: no update needed`
	}

	// Submit signed report
	const reportData = encodeAbiParameters([{ type: 'uint256' }], [newRateFixed])
	const reportRequest = prepareReportRequest(reportData)
	const report = runtime.report(reportRequest).result()

	const writeResult = evmClient
		.writeReport(runtime, {
			receiver: evmConfig.oracleAddress,
			report,
		})
		.result()

	const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))

	if (writeResult.txStatus !== TxStatus.SUCCESS) {
		runtime.log(`[${evmConfig.chainSelectorName}] TX failed: ${writeResult.errorMessage || writeResult.txStatus}`)
		return `${evmConfig.chainSelectorName}: failed`
	}

	runtime.log(`[${evmConfig.chainSelectorName}] Updated to ${newRateFixed.toString()}. TX: ${txHash}`)
	return `${evmConfig.chainSelectorName}: updated — tx: ${txHash}`
}

export const onCronTrigger = (runtime: Runtime<Config>): string => {
	const config = runtime.config

	runtime.log('Oracle update workflow triggered')

	// 1. Fetch rate from issuer API with DON consensus (median)
	const httpClient = new cre.capabilities.HTTPClient()
	const fetchedRate = httpClient
		.sendRequest(
			runtime,
			fetchIssuerRate,
			consensusMedianAggregation(),
		)(config)
		.result()

	runtime.log(`Fetched issuer rate: ${fetchedRate}`)

	const newRateFixed = rateToFixed(fetchedRate)
	runtime.log(`New rate (fixed-point): ${newRateFixed.toString()}`)

	// 2. Update oracle on each configured chain
	const results: string[] = []
	for (const evmConfig of config.evms) {
		const result = updateChain(runtime, evmConfig, newRateFixed, fetchedRate)
		results.push(result)
	}

	return results.join(' | ')
}

export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()
	return [
		cre.handler(
			cronTrigger.trigger({ schedule: config.schedule }),
			onCronTrigger,
		),
	]
}
