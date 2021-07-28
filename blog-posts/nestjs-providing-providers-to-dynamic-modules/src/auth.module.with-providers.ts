import { createConfigurableDynamicRootModule } from '@golevelup/nestjs-modules';
import { Module } from '@nestjs/common';

import { AUTH_OPTIONS, AUTH_SECRET, USER_SERVICE } from './auth.constants';
import { AuthModuleOptions } from './auth.interface';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService],
})
export class AuthModule extends createConfigurableDynamicRootModule<AuthModule, AuthModuleOptions>(AUTH_OPTIONS, {
  providers: [
    {
      provide: AUTH_SECRET,
      inject: [AUTH_OPTIONS],
      useFactory: (options: AuthModuleOptions) => options.secret,
    },
    {
      provide: USER_SERVICE,
      inject: [AUTH_OPTIONS],
      useFactory: (options: AuthModuleOptions) => options.userService,
    },
  ],
}) {}
