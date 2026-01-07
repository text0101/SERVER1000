/**
 * Shared Password Detection Utility
 * 
 * Used by both Invoice and Bank Statement processors to detect
 * when a file requires a password.
 */

export const isPasswordRequiredError = (error: any): boolean => {
    // Check status code first
    const status = error.status || error.response?.status;
    if (status !== 422) return false;

    // Check message content
    const message = error.message || error.detail || error.error || '';
    if (!message) return false;

    const lowerMsg = message.toLowerCase();

    return (
        lowerMsg.includes('password') ||
        lowerMsg.includes('encrypted') ||
        lowerMsg.includes('locked') ||
        lowerMsg.includes('protected')
    );
};

export default isPasswordRequiredError;
