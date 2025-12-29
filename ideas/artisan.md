artisan.md

  | Command     | Purpose                       | Example                                         |
  |-------------|-------------------------------|-------------------------------------------------|
  | wa:status   | Check bridge connection       | php artisan wa:status                           |
  | wa:send     | Send a message                | php artisan wa:send 0812xxx "hello"             |
  | wa:webhook  | Test webhook endpoint (HTTP)  | php artisan wa:webhook 0812xxx "test" --process |
  | wa:simulate | Direct job dispatch (no HTTP) | php artisan wa:simulate 0812xxx "test" --sync   |
  | wa:test     | Test LLM processing pipeline  | php artisan wa:test "query" --create-user       |