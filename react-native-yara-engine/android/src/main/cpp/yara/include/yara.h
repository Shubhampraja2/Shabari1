/*
 * YARA Header for Android Build
 * Minimal implementation for React Native YARA Engine
 */

#ifndef YARA_H
#define YARA_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// Error codes
#define ERROR_SUCCESS                    0
#define ERROR_INSUFFICIENT_MEMORY        1
#define ERROR_COULD_NOT_ATTACH_TO_PROCESS 2
#define ERROR_COULD_NOT_OPEN_FILE        3
#define ERROR_COULD_NOT_MAP_FILE         4
#define ERROR_INVALID_FILE               5
#define ERROR_CORRUPT_FILE               6
#define ERROR_UNSUPPORTED_FILE_VERSION   7
#define ERROR_INVALID_REGULAR_EXPRESSION 8
#define ERROR_INVALID_HEX_STRING         9
#define ERROR_SYNTAX_ERROR               10
#define ERROR_LOOP_NESTING_LIMIT_EXCEEDED 11
#define ERROR_DUPLICATED_LOOP_IDENTIFIER 12
#define ERROR_DUPLICATED_IDENTIFIER      13
#define ERROR_DUPLICATED_TAG_IDENTIFIER  14
#define ERROR_DUPLICATED_META_IDENTIFIER 15
#define ERROR_DUPLICATED_STRING_IDENTIFIER 16
#define ERROR_UNREFERENCED_STRING        17
#define ERROR_UNDEFINED_STRING           18
#define ERROR_UNDEFINED_IDENTIFIER       19
#define ERROR_MISPLACED_ANONYMOUS_STRING 20
#define ERROR_INCLUDES_CIRCULAR_REFERENCE 21
#define ERROR_INCLUDE_DEPTH_EXCEEDED     22
#define ERROR_WRONG_RULE_SYNTAX          23
#define ERROR_CALLBACK_ERROR             24
#define ERROR_INVALID_ARGUMENT           25
#define ERROR_TOO_MANY_MATCHES           26
#define ERROR_INTERNAL_FATAL_ERROR       27
#define ERROR_NESTED_FOR_OF_LOOP         28
#define ERROR_INVALID_FIELD_NAME         29
#define ERROR_UNKNOWN_MODULE             30
#define ERROR_NOT_A_STRUCTURE            31
#define ERROR_NOT_INDEXABLE              32
#define ERROR_NOT_A_FUNCTION             33
#define ERROR_INVALID_FORMAT             34
#define ERROR_TOO_MANY_ARGUMENTS         35
#define ERROR_WRONG_ARGUMENTS            36
#define ERROR_WRONG_RETURN_TYPE          37
#define ERROR_DUPLICATED_STRUCTURE_MEMBER 38
#define ERROR_EMPTY_STRING               39
#define ERROR_DIVISION_BY_ZERO           40
#define ERROR_REGULAR_EXPRESSION_TOO_LARGE 41
#define ERROR_TOO_MANY_RE_FIBERS         42
#define ERROR_COULD_NOT_READ_PROCESS_MEMORY 43
#define ERROR_INVALID_EXTERNAL_VARIABLE_TYPE 44
#define ERROR_TOO_MANY_SCAN_THREADS 45

// Scan flags
#define SCAN_FLAGS_FAST_MODE             0x01
#define SCAN_FLAGS_PROCESS_MEMORY        0x02
#define SCAN_FLAGS_NO_TRYCATCH           0x04
#define SCAN_FLAGS_REPORT_RULES_MATCHING 0x08

// Callback messages
#define CALLBACK_MSG_RULE_MATCHING       1
#define CALLBACK_MSG_RULE_NOT_MATCHING   2
#define CALLBACK_MSG_SCAN_FINISHED       3
#define CALLBACK_MSG_IMPORT_MODULE       4
#define CALLBACK_MSG_MODULE_IMPORTED     5

// Callback return values
#define CALLBACK_CONTINUE                0
#define CALLBACK_ABORT                   1
#define CALLBACK_ERROR                   2

// Forward declarations
typedef struct YR_COMPILER YR_COMPILER;
typedef struct YR_RULES YR_RULES;
typedef struct YR_RULE YR_RULE;
typedef struct YR_STRING YR_STRING;
typedef struct YR_MATCH YR_MATCH;
typedef struct YR_SCAN_CONTEXT YR_SCAN_CONTEXT;

// Rule structure (simplified)
struct YR_RULE {
    int32_t g_flags;
    int32_t t_flags;
    char* identifier;
    char* tags;
    YR_STRING* strings;
    YR_RULE* prev;
    YR_RULE* next;
};

// Compiler structure (opaque)
struct YR_COMPILER {
    void* internal;
};

// Rules structure (opaque)
struct YR_RULES {
    void* internal;
};

// Scan context (simplified)
struct YR_SCAN_CONTEXT {
    void* internal;
};

// Match structure
struct YR_MATCH {
    int64_t base;
    int64_t offset;
    int32_t match_length;
    int32_t data_length;
    const uint8_t* data;
    YR_MATCH* prev;
    YR_MATCH* next;
};

// String structure
struct YR_STRING {
    int32_t g_flags;
    char* identifier;
    YR_MATCH* matches_head;
    YR_MATCH* matches_tail;
    YR_RULE* rule;
    int32_t idx;
    YR_STRING* prev;
    YR_STRING* next;
};

// Callback function type
typedef int (*YR_CALLBACK_FUNC)(
    YR_SCAN_CONTEXT* context,
    int message,
    void* message_data,
    void* user_data);

// Core YARA functions
int yr_initialize(void);
int yr_finalize(void);

// Compiler functions
int yr_compiler_create(YR_COMPILER** compiler);
void yr_compiler_destroy(YR_COMPILER* compiler);
int yr_compiler_add_string(YR_COMPILER* compiler, const char* rules_string, const char* namespace_);
int yr_compiler_get_rules(YR_COMPILER* compiler, YR_RULES** rules);

// Rules functions
void yr_rules_destroy(YR_RULES* rules);
int yr_rules_scan_file(YR_RULES* rules, const char* filename, int flags, YR_CALLBACK_FUNC callback, void* user_data, int timeout);
int yr_rules_scan_mem(YR_RULES* rules, const uint8_t* buffer, size_t buffer_size, int flags, YR_CALLBACK_FUNC callback, void* user_data, int timeout);

// Utility macros
#define yr_rules_foreach(rules, rule) \
    for (rule = (YR_RULE*)(rules); rule != NULL; rule = rule->next)

#define yr_string_foreach(rule, string) \
    for (string = (rule)->strings; string != NULL; string = string->next)

#define yr_match_foreach(string, match) \
    for (match = (string)->matches_head; match != NULL; match = match->next)

#ifdef __cplusplus
}
#endif

#endif // YARA_H 