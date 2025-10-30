export function bigIntToFloat(value: bigint, decimals: number): number {
  if (value === 0n) {
    return 0;
  }
  const negative = value < 0;
  const absValue = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const integerPart = absValue / base;
  const fractionalPart = absValue % base;
  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const integerStr = integerPart.toString();
  const combined = fractionalStr.length ? `${integerStr}.${fractionalStr}` : integerStr;
  const result = Number(combined);
  return negative ? -result : result;
}
