import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

import { LoginUserDto, RegisterUserDto } from './models';
import { User } from './models/user.interface';

@Injectable()
export class AuthService {
  /* In an ideal application you would want to use data from an actual database,
  We used an array of users here for the simplicity of this tutorial */
  private users: User[] = [
    {
      id: 1,
      firstName: 'Joe',
      lastName: 'Foo',
      email: 'joefoo@test.com',
      // Passw0rd!
      password: '$2b$12$s50omJrK/N3yCM6ynZYmNeen9WERDIVTncywePc75.Ul8.9PUk0LK',
      role: 'admin',
    },
    {
      id: 2,
      firstName: 'Jen',
      lastName: 'Bar',
      email: 'jenbar@test.com',
      // P4ssword!
      password: '$2b$12$FHUV7sHexgNoBbP8HsD4Su/CeiWbuX/JCo8l2nlY1yCo2LcR3SjmC',
      role: 'user',
    },
  ];

  /* This method validates a users credentials and returns the user object */
  async validateUser(user: LoginUserDto) {
    const foundUser = this.users.find(u => u.email === user.email);
    if (!user || !(await compare(user.password, foundUser.password))) {
      throw new UnauthorizedException('Incorrect username or password');
    }
    const { password: _password, ...retUser } = foundUser;
    return retUser;
  }
  /* Ideally you would want to store your users in a database.
  We also return the user object but without the password or confirmationPassword */
  async registerUser(user: RegisterUserDto): Promise<Omit<User, 'password'>> {
    const existingUser = this.users.find(u => u.email === user.email);
    if (existingUser) {
      throw new BadRequestException('User email must be unique');
    }
    if (user.password !== user.confirmationPassword) {
      throw new BadRequestException('Password and Confirmation Password must match');
    }
    const { confirmationPassword: _, ...newUser } = user;
    this.users.push({
      ...newUser,
      password: await hash(user.password, 12),
      id: this.users.length + 1,
    });
    return {
      id: this.users.length,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    };
  }
  
  findById(id: number): Omit<User, 'password'> {
    const { password: _, ...user } = this.users.find(u => u.id === id);
    if (!user) {
      throw new BadRequestException(`No user found with id ${id}`);
    }
    return user;
  }
}
