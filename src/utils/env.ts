import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import dotenv from 'dotenv';

dotenv.config();

const envConfigScheme = Type.Object({
  EPIC_CLIENT_ID: Type.String(),
  EPIC_CLIENT_SECRET: Type.String(),

  EPIC_ACCOUNT_ID: Type.String(),
  EPIC_DEVICE_ID: Type.String(),
  EPIC_DEVICE_SECRET: Type.String(),

  WEBHOOK_URL: Type.String(),
});

const error = Value.Errors(envConfigScheme, process.env).First();

if (error) {
  throw new TypeError(`Invalid Environment Config: ${error.message} at ${error.path} (${error.type}), value is '${String(error.value)}'`);
}

export default Value.Decode(envConfigScheme, process.env);
