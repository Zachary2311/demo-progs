import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Signup from '../../web/pages/Signup';
import { useToastStore } from '../../web/store';

// Reset stores before each test
beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe('Signup page', () => {
  const renderSignup = () => {
    return render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );
  };

  it('renders signup form', () => {
    renderSignup();
    
    expect(screen.getByText('Create an account')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows link to login page', () => {
    renderSignup();
    
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('validates password match', async () => {
    renderSignup();
    
    const nameInput = screen.getByLabelText(/name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    
    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'different' } });
    
    // Submit the form directly
    const form = nameInput.closest('form')!;
    fireEvent.submit(form);
    
    // Check that error toast was added - wait for state update
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.message.includes('match'))).toBe(true);
    });
  });

  it('validates password length', async () => {
    renderSignup();
    
    const nameInput = screen.getByLabelText(/name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    
    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'short' } });
    
    // Submit the form directly
    const form = nameInput.closest('form')!;
    fireEvent.submit(form);
    
    // Check that error toast was added - wait for state update
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.message.includes('8 characters'))).toBe(true);
    });
  });
});
