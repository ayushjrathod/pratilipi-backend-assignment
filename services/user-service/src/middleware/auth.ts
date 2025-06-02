import { sign, verify } from 'jsonwebtoken';

const API_SECRET = process.env.API_SECRET;
if (!API_SECRET) {
  throw new Error(
    "Critical Error: Environment vrariable 'API_SECRET' is not defined.Authentication cannot operate."
  );
}

const signJWT = (userId: string): string => {
  if (!process.env.API_SECRET) {
    throw new Error('Environment variable not defined: API_SECRET');
  }
  return sign({ userId }, process.env.API_SECRET);
};

const verifyJWT = (token: string): { userId: string } => {
  if (!process.env.API_SECRET) {
    throw new Error('Environment variable not defined: API_SECRET');
  }
  return verify(token, process.env.API_SECRET) as { userId: string };
};

export { signJWT, verifyJWT };
