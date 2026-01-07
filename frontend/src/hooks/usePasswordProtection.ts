import { useState, useCallback } from 'react';

/**
 * Unified Password Protection Hook
 * 
 * Provides a single, shared mechanism for handling password-protected files
 * across different document types (Invoice, Bank Statement).
 * 
 * Features:
 * - Shared detection and modal state
 * - Supports callback-based unlock for different processors
 * - Tracks document type for proper modal display
 */

export type DocumentType = 'Invoice' | 'Bank Statement';

interface PasswordState<T> {
    isOpen: boolean;
    file: T | null;
    error: string;
    documentType: DocumentType;
    onUnlock: ((password: string) => Promise<void>) | null;
}

export function usePasswordProtection<T>() {
    const [state, setState] = useState<PasswordState<T>>({
        isOpen: false,
        file: null,
        error: '',
        documentType: 'Invoice',
        onUnlock: null
    });

    /**
     * Request password for a file
     * @param file - The file requiring password
     * @param documentType - Type of document for proper modal display
     * @param onUnlock - Callback to execute when password is provided
     * @param errorMessage - Optional initial error message (for retries)
     */
    const requirePassword = useCallback((
        file: T,
        documentType: DocumentType,
        onUnlock: (password: string) => Promise<void>,
        errorMessage: string = ''
    ) => {
        setState({
            isOpen: true,
            file,
            error: errorMessage,
            documentType,
            onUnlock
        });
    }, []);

    /**
     * Close the password modal and reset state
     */
    const closePasswordModal = useCallback(() => {
        setState({
            isOpen: false,
            file: null,
            error: '',
            documentType: 'Invoice',
            onUnlock: null
        });
    }, []);

    /**
     * Set error message (for incorrect password retries)
     */
    const setPasswordError = useCallback((error: string) => {
        setState(prev => ({ ...prev, error }));
    }, []);

    /**
     * Handle password submission
     * Calls the stored onUnlock callback with the provided password
     */
    const handlePasswordSubmit = useCallback(async (password: string) => {
        if (state.onUnlock) {
            try {
                await state.onUnlock(password);
                // Callback is responsible for closing modal on success
            } catch (err: any) {
                // If callback throws, show error
                setPasswordError(err.message || 'Password incorrect. Please try again.');
            }
        }
    }, [state.onUnlock, setPasswordError]);

    return {
        // State
        isOpen: state.isOpen,
        passwordFile: state.file,
        passwordError: state.error,
        documentType: state.documentType,

        // Actions
        requirePassword,
        closePasswordModal,
        setPasswordError,
        handlePasswordSubmit
    };
}

export default usePasswordProtection;
