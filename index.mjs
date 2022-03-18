function nullableIf(GraphQLNonNull, condition, Type)
{
    return condition ? Type : new GraphQLNonNull(Type);
}

/**
 *
 * @param {Object}      options
 * @param {function}    options.nameFn
 * @param {string}      options.defaultFormat Default format of the timestamp
 * @returns {function(*): *}
 */
export default function(
    {
        nameFn = (name) => name + 'Formatted',
        defaultFormat = 'YYYY-MM-DD"T"HH24:MI:SSOF' // ISO 8601
    } = {}
)
{
    return function(builder)
    {
        return builder.hook(
            'GraphQLObjectType:fields',
            (fields, build, context) =>
            {
                const {
                    extend,
                    getSafeAliasFromAlias,
                    getSafeAliasFromResolveInfo,
                    pgSql: sql,
                    pg2gqlForType,
                    graphql: { GraphQLNonNull, GraphQLString },
                    pgColumnFilter,
                    inflection,
                    pgOmit: omit,
                    pgGetSelectValueForFieldAndTypeAndModifier,
                    describePgEntity,
                    sqlCommentByAddingTags,
                } = build;

                const {
                    scope: { isPgRowType, isPgCompoundType, pgIntrospection: table },
                    fieldWithHooks,
                } = context;

                if (
                    !(isPgRowType || isPgCompoundType) ||
                    !table ||
                    table.kind !== 'class'
                ) {
                    return fields;
                }

                return extend(
                    fields,
                    table.attributes.reduce((memo, attr) => {
                        if (!pgColumnFilter(attr, build, context))
                            return memo;

                        if (omit(attr, 'read'))
                            return memo;

                        if(attr.type.name !== 'timestamptz')
                            return memo;

                        // Exclude columns that are primary key
                        if(table.primaryKeyConstraint && table.primaryKeyConstraint.keyAttributeNums.includes(attr.num))
                            return memo;

                        // Exclude columns that are foreign keys
                        if(table.constraints.some(constraint => constraint.type === 'f' && constraint.keyAttributeNums.includes(attr.num)))
                            return memo;

                        const fieldName = nameFn(inflection.column(attr));

                        memo = extend(
                            memo,
                            {
                                [fieldName]: fieldWithHooks(
                                    fieldName,
                                    fieldContext => {
                                        const { type, typeModifier } = attr;
                                        const sqlColumn = sql.identifier(attr.name);
                                        const { addDataGenerator } = fieldContext;
                                        const ReturnType = GraphQLString;

                                        addDataGenerator(
                                            parsedResolveInfoFragment =>
                                            {
                                                const { args } = parsedResolveInfoFragment;
                                                const tz = args.tz ? sql.value(args.tz) : sql.fragment`current_setting('TimeZone')`;
                                                const format = args.format ? sql.value(args.format) : sql.value(defaultFormat);

                                                return {
                                                    pgQuery: queryBuilder =>
                                                    {
                                                        queryBuilder.select(
                                                            pgGetSelectValueForFieldAndTypeAndModifier(
                                                                ReturnType,
                                                                fieldContext,
                                                                parsedResolveInfoFragment,
                                                                sql.fragment`(public.date_format_tz(${queryBuilder.getTableAlias()}.${sqlColumn}, ${format}, ${tz}))`, // The brackets are necessary to stop the parser getting confused, ref: https://www.postgresql.org/docs/9.6/static/rowtypes.html#ROWTYPES-ACCESSING
                                                                type,
                                                                typeModifier
                                                            ),
                                                            getSafeAliasFromAlias(parsedResolveInfoFragment.alias)
                                                        );
                                                    },
                                                };
                                            }
                                        );

                                        const convertFromPg = pg2gqlForType(type);

                                        return {
                                            args:
                                            {
                                                format: { type: GraphQLString, description: 'See https://www.postgresql.org/docs/current/functions-formatting.html' },
                                                tz: { type: GraphQLString, description: 'Timezone to format the date in' }
                                            },
                                            description: attr.description,
                                            type: nullableIf(
                                                GraphQLNonNull,
                                                !attr.isNotNull &&
                                                !attr.type.domainIsNotNull &&
                                                !attr.tags.notNull,
                                                ReturnType
                                            ),
                                            resolve(data, _args, _ctx, _info)
                                            {
                                                return convertFromPg(data[getSafeAliasFromResolveInfo(_info)]);
                                            }
                                        };
                                    },
                                    { pgFieldIntrospection: attr }
                                ),
                            },
                            `Adding field for ${describePgEntity(
                                attr
                            )}. You can rename this field with a 'Smart Comment':\n\n  ${sqlCommentByAddingTags(
                                attr,
                                { name: "newNameHere" }
                            )}`
                        );
                        return memo;
                    }, {}),
                    `Adding columns to '${describePgEntity(table)}'`
                );
            },
            ['PgColumns']
        );
    }
}