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

export const onCronTrigger = (runtime: Runtime<Config>): string => {
	const config = runtime.config
	const evmConfig = config.evms[0]

	runtime.log('Oracle update workflow triggered')

	// 1. Get network and create EVM client
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: evmConfig.chainSelectorName,
		isTestnet: true,
	})
	if (!network) throw new Error(`Network not found: ${evmConfig.chainSelectorName}`)

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

	// 2. Fetch rate from issuer API with DON consensus (median)
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

	// 3. Read current on-chain rate from CREOracleConsumer
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
		runtime.log('Could not read on-chain rate (contract may not be deployed yet)')
	}

	runtime.log(`Current on-chain rate: ${currentRate.toString()}`)

	// 4. Check deviation threshold
	if (!deviationExceeds(currentRate, newRateFixed, config.deviationThresholdBips)) {
		runtime.log(
			`Rate deviation below threshold (${config.deviationThresholdBips} bips), skipping update`,
		)
		return 'No update needed'
	}

	runtime.log(`Rate deviation exceeds ${config.deviationThresholdBips} bips, submitting report`)

	// 5. Generate and submit signed report to CREOracleConsumer
	const reportData = encodeAbiParameters([{ type: 'uint256' }], [newRateFixed])
	const reportRequest = prepareReportRequest(reportData)
	const report = runtime.report(reportRequest).result()

	const writeResult = evmClient
		.writeReport(runtime, {
			receiver: evmConfig.oracleAddress,
			report,
		})
		.result()

	if (writeResult.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Oracle update TX failed: ${writeResult.errorMessage || writeResult.txStatus}`)
	}

	const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
	runtime.log(`Oracle updated to ${newRateFixed.toString()}. TX: ${txHash}`)
	return `Rate updated: ${fetchedRate} — tx: ${txHash}`
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
