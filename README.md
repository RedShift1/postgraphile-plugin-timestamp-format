# postgraphile-plugin-timestamp-format

Adds formatting for `timestamptz` fields through
[PostgreSQL's `to_char`](https://www.postgresql.org/docs/current/functions-formatting.html) function.

![GraphiQL Screenshot](doc/graphiql_screenshot.png)

## Installation
Install the npm package:

`npm install postgraphile-plugin-timestamp-format`

Add the `date_format_tz` function to your database:

```postgresql
CREATE OR REPLACE FUNCTION
    public.date_format_tz(
        input_timestamp timestamp with time zone,
        format text,
        tz text
    )
    RETURNS text
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE STRICT PARALLEL UNSAFE
AS $BODY$
DECLARE result text;
BEGIN
	PERFORM set_config('TimeZone', tz, true);
	result := to_char(input_timestamp, format);
	RESET TimeZone;
	RETURN result;
END;
$BODY$;
```

Add PostGraphilePluginTimestampFormat to appendPlugins:

```js
import express from 'express';
import postgraphile from 'postgraphile';
import PostGraphilePluginTimestampFormat from 'postgraphile-plugin-timestamp-format';

const app = express();

app.use(
    postgraphile(
        process.env.DATABASE_URL || 'postgres://user:pass@host:5432/dbname',
        'public',
        {
            appendPlugins:
            [
                PostGraphilePluginTimestampFormat()
            ],
            watchPg: true,
            graphiql: true,
            enhanceGraphiql: true,
        }
    )
);

app.listen(process.env.PORT || 3000);

```

## API
### PostGraphilePluginTimestampFormat({ [nameFn], [defaultFormat] })

Constructs the plugin.

* `nameFn` - `function(name: string): string`, called when a name is generated for the formatted timestamp field.
  The returned string is used as the new field's name in the GraphQL schema
* `defaultFormat` - `string`, Default timestamp format to use when called without a `format` argument

## Supported timezones
Which timezones are supported depends on your operating system. Run the following query
on your database server to get a list:

```postgresql
SELECT name FROM pg_timezone_names() ORDER BY name;
```

## Default timezone
When no tz argument is provided by the GraphQL query, the server's default timezone
setting is used. Run the following query to know the default timezone your database
server uses:

```postgresql
SELECT current_setting('TimeZone');
```