import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type UserDto } from '../api/auth.api';

interface AuthContextType {
  user: UserDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: check if we have a stored token and fetch user
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authApi
        .me()
        .then((res) => {
          if (res.data.success && res.data.data) {
            setUser(res.data.data);
          }
        })
        .catch(() => {
          localStorage.clear();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (res.data.success && res.data.data) {
      const { accessToken, refreshToken, user: userData } = res.data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
    } else {
      throw new Error(res.data.message || 'Login failed');
    }
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
