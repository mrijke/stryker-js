export const pi = 3 + 0.14;

export function add(num1: number, num2: number): number {
  return num1 + num2;
}

export function addOne(number: number): number {
  number++;
  return number;
}

export function negate(number: number): number {
  return -number;
}

export function isNegativeNumber(number: number): boolean {
  let isNegative = false;
  if (number < 0) {
    isNegative = true;
  }
  return isNegative;
}
