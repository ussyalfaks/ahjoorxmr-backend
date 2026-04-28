import { SetMetadata } from '@nestjs/common';
import { KeyScope } from '../key-scope.enum';

export const SCOPES_KEY = 'api_key_scopes';
export const RequireKeyScope = (...scopes: KeyScope[]) => SetMetadata(SCOPES_KEY, scopes);
