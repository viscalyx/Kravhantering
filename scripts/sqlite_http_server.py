#!/usr/bin/env python3
"""SQLite HTTP proxy for local dev, CI, and prod-like testing.

The service exposes a small JSON API that matches the needs of
`drizzle-orm/sqlite-proxy`:

- `GET /healthz`
- `POST /query` with `{ sql, params, method }`
- `POST /batch` with `{ queries: [{ sql, params, method }] }`
- `POST /reset` to delete and recreate the SQLite database file
- `POST /exec` with `{ sql }` to run a multi-statement SQL script

Transactions are coordinated with the `x-sqlite-transaction-id` header. While a
transaction is active, unrelated requests wait so their statements cannot
interleave with the active transaction on the shared SQLite file.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import threading
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, cast


@dataclass(frozen=True)
class ServerConfig:
    db_file: Path
    host: str
    port: int


class SqliteProxyState:
    def __init__(self, db_file: Path) -> None:
        self._db_file = db_file
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._active_transaction_id: str | None = None
        self._connections: dict[str, sqlite3.Connection] = {}

    def _create_connection(self) -> sqlite3.Connection:
        self._db_file.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(
            self._db_file,
            detect_types=sqlite3.PARSE_DECLTYPES,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = None
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _wait_for_slot(self, transaction_id: str | None) -> None:
        with self._condition:
            while (
                self._active_transaction_id is not None
                and self._active_transaction_id != transaction_id
            ):
                self._condition.wait()

    def _claim_transaction(self, transaction_id: str | None, statement: str) -> None:
        normalized = statement.strip().lower()
        if transaction_id is None or not normalized.startswith("begin"):
            return

        with self._condition:
            while (
                self._active_transaction_id is not None
                and self._active_transaction_id != transaction_id
            ):
                self._condition.wait()

            self._active_transaction_id = transaction_id

    def _release_transaction(self, transaction_id: str | None, statement: str) -> None:
        normalized = statement.strip().lower()
        if transaction_id is None:
            return

        if not (
            normalized.startswith("commit") or normalized.startswith("rollback")
        ):
            return

        with self._condition:
            if self._active_transaction_id == transaction_id:
                self._active_transaction_id = None
            connection = self._connections.pop(transaction_id, None)
            if connection is not None:
                connection.close()
            self._condition.notify_all()

    def _connection_for(self, transaction_id: str | None) -> tuple[sqlite3.Connection, bool]:
        if transaction_id is None:
            return self._create_connection(), True

        with self._lock:
            connection = self._connections.get(transaction_id)
            if connection is None:
                connection = self._create_connection()
                self._connections[transaction_id] = connection
            return connection, False

    def _close_if_ephemeral(self, connection: sqlite3.Connection, should_close: bool) -> None:
        if should_close:
            connection.close()

    @staticmethod
    def _row_to_json(row: Any) -> Any:
        if row is None:
            return None
        if isinstance(row, tuple):
            return list(cast(tuple[Any, ...], row))
        return row

    def query(
        self,
        sql_text: str,
        params: list[Any],
        method: str,
        transaction_id: str | None,
    ) -> dict[str, Any]:
        self._claim_transaction(transaction_id, sql_text)
        self._wait_for_slot(transaction_id)
        connection, should_close = self._connection_for(transaction_id)

        try:
            cursor = connection.execute(sql_text, params)
            if method == "get":
                return {"rows": self._row_to_json(cursor.fetchone())}
            if method == "values":
                return {"rows": [list(row) for row in cursor.fetchall()]}
            if method == "all":
                return {"rows": [list(row) for row in cursor.fetchall()]}
            return {"rows": []}
        finally:
            self._close_if_ephemeral(connection, should_close)
            self._release_transaction(transaction_id, sql_text)

    def batch(
        self,
        queries: list[dict[str, Any]],
        transaction_id: str | None,
    ) -> list[dict[str, Any]]:
        self._wait_for_slot(transaction_id)
        connection, should_close = self._connection_for(transaction_id)

        try:
            results: list[dict[str, Any]] = []
            if transaction_id is None:
                connection.execute("BEGIN IMMEDIATE")

            try:
                for query in queries:
                    results.append(
                        self._execute_on_connection(
                            connection,
                            query["sql"],
                            query.get("params", []),
                            query["method"],
                        )
                    )
                if transaction_id is None:
                    connection.execute("COMMIT")
                return results
            except Exception:
                if transaction_id is None:
                    connection.execute("ROLLBACK")
                raise
        finally:
            self._close_if_ephemeral(connection, should_close)

    def exec_script(self, sql_text: str) -> dict[str, Any]:
        self._wait_for_slot(None)
        connection, should_close = self._connection_for(None)

        try:
            connection.executescript(sql_text)
            return {"ok": True}
        finally:
            self._close_if_ephemeral(connection, should_close)

    def reset(self) -> dict[str, Any]:
        with self._condition:
            while self._active_transaction_id is not None:
                self._condition.wait()

            for connection in self._connections.values():
                connection.close()
            self._connections.clear()

            for suffix in ("", "-wal", "-shm"):
                path = Path(f"{self._db_file}{suffix}")
                if path.exists():
                    path.unlink()

        return {"ok": True}

    def health(self) -> dict[str, Any]:
        return {
            "activeTransactionId": self._active_transaction_id,
            "dbFile": str(self._db_file),
            "ok": True,
        }

    def _execute_on_connection(
        self,
        connection: sqlite3.Connection,
        sql_text: str,
        params: list[Any],
        method: str,
    ) -> dict[str, Any]:
        cursor = connection.execute(sql_text, params)
        if method == "get":
            return {"rows": self._row_to_json(cursor.fetchone())}
        if method == "values":
            return {"rows": [list(row) for row in cursor.fetchall()]}
        if method == "all":
            return {"rows": [list(row) for row in cursor.fetchall()]}
        return {"rows": []}


class SqliteProxyHandler(BaseHTTPRequestHandler):
    server_version = "KravhanteringSQLiteProxy/1.0"

    def _json_response(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json_response_raw(self, status: int, payload: Any) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _transaction_id(self) -> str | None:
        return self.headers.get("x-sqlite-transaction-id")

    @property
    def state(self) -> SqliteProxyState:
        return self.server.state  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self._json_response(HTTPStatus.OK, self.state.health())
            return

        self._json_response(
            HTTPStatus.NOT_FOUND,
            {"error": f"Unsupported endpoint: {self.path}"},
        )

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = self._read_json()

            if self.path == "/query":
                result = self.state.query(
                    payload["sql"],
                    payload.get("params", []),
                    payload["method"],
                    self._transaction_id(),
                )
                self._json_response(HTTPStatus.OK, result)
                return

            if self.path == "/batch":
                result = self.state.batch(
                    payload.get("queries", []),
                    self._transaction_id(),
                )
                self._json_response_raw(HTTPStatus.OK, result)
                return

            if self.path == "/exec":
                self._json_response(
                    HTTPStatus.OK,
                    self.state.exec_script(payload.get("sql", "")),
                )
                return

            if self.path == "/reset":
                self._json_response(HTTPStatus.OK, self.state.reset())
                return

            self._json_response(
                HTTPStatus.NOT_FOUND,
                {"error": f"Unsupported endpoint: {self.path}"},
            )
        except KeyError as error:
            self._json_response(
                HTTPStatus.BAD_REQUEST,
                {"error": f"Missing required field: {error.args[0]}"},
            )
        except json.JSONDecodeError as error:
            self._json_response(
                HTTPStatus.BAD_REQUEST,
                {"error": f"Invalid JSON payload: {error.msg}"},
            )
        except sqlite3.Error as error:
            self._json_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"SQLite error: {error}"},
            )
        except Exception as error:  # pragma: no cover - defensive fallback
            self._json_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"Unexpected error: {error}"},
            )

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        if os.environ.get("SQLITE_PROXY_QUIET") == "1":
            return
        super().log_message(format, *args)


def parse_args() -> ServerConfig:
    parser = argparse.ArgumentParser(description="Run the SQLite HTTP proxy.")
    parser.add_argument(
        "--db-file",
        default=os.environ.get("SQLITE_DB_FILE", "/var/lib/kravhantering/dev.sqlite"),
        help="Path to the SQLite database file.",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("SQLITE_PROXY_HOST", "127.0.0.1"),
        help="Host interface to bind.",
    )
    parser.add_argument(
        "--port",
        default=int(os.environ.get("SQLITE_PROXY_PORT", "9000")),
        type=int,
        help="Port to bind.",
    )
    args = parser.parse_args()
    return ServerConfig(
        db_file=Path(args.db_file),
        host=args.host,
        port=args.port,
    )


def main() -> None:
    config = parse_args()
    state = SqliteProxyState(config.db_file)
    server = ThreadingHTTPServer((config.host, config.port), SqliteProxyHandler)
    server.state = state  # type: ignore[attr-defined]

    print(
        f"SQLite proxy listening on http://{config.host}:{config.port} "
        f"using {config.db_file}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
