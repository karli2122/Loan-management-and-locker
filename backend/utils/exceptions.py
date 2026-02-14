"""Custom exception classes for EMI Device Admin application"""
import uuid


class ApplicationException(Exception):
    """Base exception class for application errors"""
    def __init__(self, message: str, error_code: str, correlation_id: str = None):
        self.message = message
        self.error_code = error_code
        self.correlation_id = correlation_id or str(uuid.uuid4())
        super().__init__(self.message)
    
    def to_response(self):
        return {
            "error": self.message,
            "code": self.error_code,
            "correlation_id": self.correlation_id
        }


class ValidationException(ApplicationException):
    """Raised when input validation fails"""
    def __init__(self, message: str = "The provided data is invalid.", correlation_id: str = None):
        super().__init__(message, "VALIDATION_ERROR", correlation_id)


class AuthenticationException(ApplicationException):
    """Raised when authentication fails"""
    def __init__(self, message: str = "Authentication failed.", correlation_id: str = None):
        super().__init__(message, "AUTHENTICATION_ERROR", correlation_id)


class AuthorizationException(ApplicationException):
    """Raised when authorization fails"""
    def __init__(self, message: str = "Permission denied.", correlation_id: str = None):
        super().__init__(message, "AUTHORIZATION_ERROR", correlation_id)
