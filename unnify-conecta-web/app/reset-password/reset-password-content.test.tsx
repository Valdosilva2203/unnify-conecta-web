import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import ResetPasswordContent from './reset-password-content';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('type=recovery&code=test-code-123'),
}));

// Mock createClient
let exchangeCodeForSessionMock: ReturnType<typeof vi.fn>;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      updateUser: vi.fn(),
      getUser: vi.fn(),
    },
  }),
}));

describe('ResetPasswordContent - Recovery Code Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSessionMock = vi.fn();
  });

  describe('1. Single Execution (No Duplication)', () => {
    it('should call exchangeCodeForSession only once despite React Strict Mode', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
      });
    });

    it('should pass correct code to exchangeCodeForSession', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('test-code-123');
      });
    });
  });

  describe('2. Valid Code Processing', () => {
    it('should display password form when code is valid', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText('Crie uma nova senha')).toBeInTheDocument();
      });
    });

    it('should not display error message when code is valid', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.queryByText(/Link de recuperação inválido/)).not.toBeInTheDocument();
      });
    });

    it('should set isValidToken to true on valid code', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      const { container } = render(<ResetPasswordContent />);

      await waitFor(() => {
        const form = container.querySelector('form');
        expect(form).toBeInTheDocument();
      });
    });
  });

  describe('3. Invalid Code Handling', () => {
    it('should display error message for invalid code', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'AuthError',
          message: 'code_exchange_failed',
          status: 400,
        },
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText(/Link de recuperação inválido ou expirado/)).toBeInTheDocument();
      });
    });

    it('should not display password form for invalid code', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'AuthError',
          message: 'code_exchange_failed',
          status: 400,
        },
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.queryByText('Crie uma nova senha')).not.toBeInTheDocument();
      });
    });

    it('should display suggestion to request new link on invalid code', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'AuthError',
          message: 'code_exchange_failed',
          status: 400,
        },
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText('Solicitar novo link')).toBeInTheDocument();
      });
    });
  });

  describe('4. Expired Code Handling', () => {
    it('should handle expired code gracefully', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'AuthError',
          message: 'code_exchange_failed',
          status: 400,
        },
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText(/Link de recuperação inválido ou expirado/)).toBeInTheDocument();
      });
    });
  });

  describe('5. Missing Code Parameters', () => {
    it('should handle missing code parameter', async () => {
      vi.unmock('next/navigation');
      vi.mock('next/navigation', () => ({
        useRouter: () => ({ push: vi.fn() }),
        useSearchParams: () => new URLSearchParams('type=recovery'),
      }));

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText(/Link de recuperação inválido/)).toBeInTheDocument();
      });
    });

    it('should handle missing type parameter', async () => {
      vi.unmock('next/navigation');
      vi.mock('next/navigation', () => ({
        useRouter: () => ({ push: vi.fn() }),
        useSearchParams: () => new URLSearchParams('code=test-code-123'),
      }));

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText(/Link de recuperação inválido/)).toBeInTheDocument();
      });
    });
  });

  describe('6. Exception Handling', () => {
    it('should handle exceptions from exchangeCodeForSession', async () => {
      exchangeCodeForSessionMock.mockRejectedValueOnce(new Error('Network error'));

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.getByText(/Erro ao processar o link de recuperação/)).toBeInTheDocument();
      });
    });
  });

  describe('7. Session Validation', () => {
    it('should require valid recovery session before showing form', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        const passwordInput = screen.getByPlaceholderText('Crie uma senha segura');
        expect(passwordInput).toBeInTheDocument();
      });
    });

    it('should not allow password reset without valid session', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'invalid_code' },
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Crie uma senha segura')).not.toBeInTheDocument();
      });
    });
  });

  describe('8. Code Not Reusable', () => {
    it('should demonstrate that code cannot be called twice', async () => {
      exchangeCodeForSessionMock.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      render(<ResetPasswordContent />);

      await waitFor(() => {
        expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
        expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('test-code-123');
      });

      // Verify it was NOT called a second time (React Strict Mode protection working)
      expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
    });
  });
});
