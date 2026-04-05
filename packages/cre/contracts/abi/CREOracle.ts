import { parseAbi } from "viem";

export const CREOracleAbi = parseAbi([
  "function rate() view returns (uint256)",
  "function rateWithTimestamp() view returns (uint256 rate, uint256 updatedAt)",
  "function minRate() view returns (uint256)",
  "function maxRate() view returns (uint256)",
  "function maxDeviationBips() view returns (uint16)",
]);
