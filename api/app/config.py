from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///labulog.db"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 10080  # 7 days
    cors_origins: str = "http://localhost:5173"
    google_client_id: str = ""  # OAuth client id; empty disables Google login

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
