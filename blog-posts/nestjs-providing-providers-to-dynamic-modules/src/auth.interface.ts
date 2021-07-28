import { UserService } from './user-service.interface';

export interface AuthModuleOptions {
  secret: string;
  userService: UserService;
}
