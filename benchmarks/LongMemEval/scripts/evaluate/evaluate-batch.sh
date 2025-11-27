#!/bin/bash

# Batch evaluation script for LongMemEval results
# Usage: ./evaluate-batch.sh --runId=<runId> [--answeringModel=<model>] [--questionType=<questionType>] [--startPosition=<startPos>] [--endPosition=<endPos>]

set -e

# Function to parse arguments
parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --runId=*) RUN_ID="${1#*=}" ;;
            --answeringModel=*) ANSWERING_MODEL="${1#*=}" ;;
            --questionType=*) QUESTION_TYPE="${1#*=}" ;;
            --startPosition=*) START_POS="${1#*=}" ;;
            --endPosition=*) END_POS="${1#*=}" ;;
            *) echo "Unknown parameter passed: $1"; exit 1 ;;
        esac
        shift
    done
}

parse_args "$@"

if [ -z "$RUN_ID" ]; then
    echo "Usage: ./evaluate-batch.sh --runId=<runId> [--answeringModel=<model>] [--questionType=<questionType>] [--startPosition=<startPos>] [--endPosition=<endPos>]"
    echo "Example: ./evaluate-batch.sh --runId=run1 --answeringModel=gpt-4o"
    echo "Example: ./evaluate-batch.sh --runId=run1 --answeringModel=gpt-5 --questionType=single-session-user"
    exit 1
fi

# Default answering model if not provided
ANSWERING_MODEL="${ANSWERING_MODEL:-gpt-4o}"

# Get script directory and root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Starting evaluation..."
echo "Run ID: $RUN_ID"
echo "Answering Model: $ANSWERING_MODEL"
if [ -n "$QUESTION_TYPE" ]; then
    echo "Question type: $QUESTION_TYPE"
else
    echo "Question type: all"
fi

if [ -n "$START_POS" ] && [ -n "$END_POS" ]; then
    echo "Processing range: $START_POS to $END_POS"
else
    echo "Using all results from each file"
fi
echo ""

# Construct the command
CMD="bun run scripts/evaluate/evaluate.ts \"$RUN_ID\" \"$ANSWERING_MODEL\""

if [ -n "$QUESTION_TYPE" ]; then
    CMD="$CMD \"$QUESTION_TYPE\""
elif [ -n "$START_POS" ]; then
    # If no question type but start pos is set, we must pass a placeholder for questionType
    # evaluate.ts treats 'all' or undefined as no filter, but args are positional.
    # evaluate.ts: const questionTypeFilter = args[2] === 'all' ? undefined : args[2];
    CMD="$CMD \"all\""
fi

if [ -n "$START_POS" ] && [ -n "$END_POS" ]; then
    CMD="$CMD \"$START_POS\" \"$END_POS\""
fi

cd "$ROOT_DIR" && eval "$CMD"
