import { sign, verify } from 'jsonwebtoken';

const API_SECRET = process.env.API_SECRET;
if (!API_SECRET) {
  throw new Error(
    "Critical Error: Environment vrariable 'API_SECRET' is not defined. Authentication cannot operate."
  );
}

const signJWT = (userId: string): string => {
  return sign({ userId }, API_SECRET);
};

const verifyJWT = (token: string): { userId: string } => {
  return verify(token, API_SECRET) as { userId: string };
};

export { signJWT, verifyJWT };
