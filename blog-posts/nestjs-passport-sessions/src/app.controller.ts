import { Controller, Get, UseGuards } from '@nestjs/common';

import { AppService } from './app.service';
import { LoggedInGuard } from './logged-in.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  publicRoute() {
    return this.appService.getPublicMessage();
  }

  @UseGuards(LoggedInGuard)
  @Get('/protected')
  guardedRoute() {
    return this.appService.getPrivateMessage();
  }
}
