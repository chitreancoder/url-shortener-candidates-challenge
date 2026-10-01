import { randomInt } from "node:crypto";

export const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const CODE_LENGTH = 7;
export const CODE_PATTERN = /^[0-9A-Za-z]{7}$/;

export type CodeGenerator = () => string;

// randomInt is a CSPRNG without modulo bias, so codes are uniform and not guessable.
export const generateCode: CodeGenerator = () => {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
};
