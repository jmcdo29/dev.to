interface User {
  id: string;
  name: string;
  email: string;
}

export interface UserService {
  find: (id: string) => User;
  insert: (user: Exclude<User, 'id'>) => User;
}
