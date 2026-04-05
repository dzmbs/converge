import { formatUnits } from "viem";

/** Format a bigint token balance for display with commas and capped decimals */
export function formatBalance(value: bigint | undefined, decimals: number, maxDecimals = 2): string {
  if (value === undefined) return "—";
  const num = Number(formatUnits(value, decimals));
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}
