import { createConfigurableDynamicRootModule } from '@golevelup/nestjs-modules';
import { Module } from '@nestjs/common';

import { AUTH_OPTIONS } from './auth.constants';
import { AuthModuleOptions } from './auth.interface';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService],
})
export class AuthModule extends createConfigurableDynamicRootModule<AuthModule, AuthModuleOptions>(AUTH_OPTIONS) {}
