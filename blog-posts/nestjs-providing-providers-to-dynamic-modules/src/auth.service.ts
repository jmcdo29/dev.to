import { Injectable, Inject } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';

import { AUTH_SECRET, USER_SERVICE } from './auth.constants';
import { UserService } from './user-service.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_SECRET) private readonly secret: string,
    @Inject(USER_SERVICE) private readonly userService: UserService,
  ) {}

  findUser(id: string) {
    return this.userService.find(id);
  }

  signToken(payload: Record<string, any>) {
    return sign(payload, this.secret);
  }

  verifyToken(token: string) {
    return verify(token, this.secret);
  }
}
