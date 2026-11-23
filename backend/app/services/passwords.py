from hashlib import pbkdf2_hmac
from secrets import compare_digest, token_bytes


def password_digest(password: str, salt: bytes) -> str:
    return pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000).hex()


def hash_password(password: str) -> str:
    # 부원마다 다른 솔트를 써서 같은 비밀번호도 다른 값으로 저장해요.
    salt = token_bytes(16)
    return salt.hex() + password_digest(password, salt)


def verify_password(password: str, stored_hash: str) -> bool:
    salt = bytes.fromhex(stored_hash[:32])
    return compare_digest(password_digest(password, salt), stored_hash[32:])
