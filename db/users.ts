import { sql } from './connection.ts';

export type UserStatus = 'ACTIVE' | 'WITHDRAWN' | 'FLAGGED';

export interface User {
  id: number;
  uuid: string;
  created_at: Date;
  status: UserStatus;
  last_login: Date | null;
  alias: string;
  active_module: number | null;
}

export class UserRepository {
  async createUser(alias: string, uuid: string, status: UserStatus = 'ACTIVE'): Promise<User> {
    const result = await sql`
      INSERT INTO users (alias, uuid, status, created_at)
      VALUES (${alias}, ${uuid}, ${status}, NOW())
      RETURNING *
    `;
    return result[0] as User;
  }

  async findByAlias(alias: string): Promise<User | null> {
    const result = await sql`
      SELECT * FROM users WHERE alias = ${alias}
    `;
    return result[0] as User || null;
  }

  async findById(id: number): Promise<User | null> {
    const result = await sql`
      SELECT * FROM users WHERE id = ${id}
    `;
    return result[0] as User || null;
  }

  async findByUuid(uuid: string): Promise<User | null> {
    const result = await sql`
      SELECT * FROM users WHERE uuid = ${uuid}
    `;
    return result[0] as User || null;
  }

  async updateUser(id: number, updates: Partial<Omit<User, 'id' | 'uuid' | 'created_at'>>): Promise<User | null> {
    if (Object.keys(updates).length === 0) return null;

    const entries = Object.entries(updates).filter(([_, value]) => value !== undefined);
    if (entries.length === 0) return null;

    const setClause = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');

    const result = await sql`
      UPDATE users 
      SET ${sql.unsafe(setClause)}
      WHERE id = ${id}
      RETURNING *
    `;
    
    return result[0] as User || null;
  }

  async updateLastLogin(id: number): Promise<User | null> {
    const result = await sql`
      UPDATE users 
      SET last_login = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] as User || null;
  }

  async setActiveModule(id: number, moduleId: number | null): Promise<User | null> {
    const result = await sql`
      UPDATE users 
      SET active_module = ${moduleId}
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] as User || null;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await sql`
      DELETE FROM users WHERE id = ${id}
    `;
    return (result as unknown as { count: number }).count > 0;
  }

  async listUsers(status?: UserStatus, limit = 50, offset = 0): Promise<User[]> {
    if (status) {
      const result = await sql`
        SELECT * FROM users 
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      return result as User[];
    }

    const result = await sql`
      SELECT * FROM users 
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as User[];
  }
}

// Export a singleton instance
export const userRepository = new UserRepository();
