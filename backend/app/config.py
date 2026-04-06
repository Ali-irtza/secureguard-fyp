from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration for the entire application.
    Pydantic-settings automatically reads values from the .env file.
    If a required variable is missing, it raises an error at startup — 
    so we catch misconfigurations immediately, not mid-request.
    """

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # App
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # CORS
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        """
        Converts the comma-separated CORS string into a list.
        Example: "http://localhost:5173,https://myapp.com" → ["http://localhost:5173", "https://myapp.com"]
        This way we can support multiple origins without changing code — just update .env
        """
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    model_config = SettingsConfigDict(
        env_file=".env",          # tells pydantic where to find the env file
        env_file_encoding="utf-8",
        case_sensitive=False,     # SUPABASE_URL and supabase_url both work
    )


# Single instance used across the entire app — import this everywhere
# This is the DRY principle: config loaded once, used anywhere
settings = Settings()
