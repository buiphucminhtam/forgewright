#!/bin/bash
NOTEBOOK_ID="8f6cbc8d-2acb-4d4a-a391-f094c8d86957"
TASK_ID="ChAzYWQyZTQ4ZDBkZDkwODkyEAgaBDYzZGEqA3Vzdw"

echo "Waiting for research to complete..."
nlm research status $NOTEBOOK_ID --task-id $TASK_ID --max-wait 600 --poll-interval 30

echo "Importing sources..."
nlm research import $NOTEBOOK_ID $TASK_ID

echo "Querying notebook for insights..."
nlm notebook query $NOTEBOOK_ID "What are the most advanced and effective B2B SaaS growth marketing trends for 2026? How is AI being used in conversion rate optimization and churn prevention? What are the latest strategies for pricing psychology and growth loops?" > .forgewright/marketing-insights.md

echo "Generating briefing doc..."
nlm report create $NOTEBOOK_ID --format "Briefing Doc" --prompt "Focus on B2B SaaS growth marketing trends for 2026, AI in conversion rate optimization, modern pricing psychology, and advanced churn prevention." --confirm

echo "All done!"
