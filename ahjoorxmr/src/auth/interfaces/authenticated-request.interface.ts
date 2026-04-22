import { Request } from 'express';
import { User } from '../../users/entities/user.entity';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string | null;
    role: string;
    walletAddress: string;
  };
}
