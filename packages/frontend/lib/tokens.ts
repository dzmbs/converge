export const TOKEN_ICONS: Record<string, string> = {
  USDC: "/tokens/usdc.svg",
  ACRED: "/tokens/acred.png",
  ETH: "/tokens/eth.svg",
};

export function getTokenIcon(symbol: string): string {
  return TOKEN_ICONS[symbol] ?? TOKEN_ICONS.USDC;
}
