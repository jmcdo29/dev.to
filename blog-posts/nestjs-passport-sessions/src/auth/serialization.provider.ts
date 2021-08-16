import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { User } from './models/user.interface';

@Injectable()
export class AuthSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }
  serializeUser(user: User, done: (err: Error, id: number) => void) {
    done(null, user.id);
  }

  deserializeUser(payload: number, done: (err: Error, user: Omit<User, 'password'>) => void) {
    const user = this.authService.findById(payload);
    done(null, user);
  }
}
