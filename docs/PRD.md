# PersonaPost AI - Project Brief

## Overview

PersonaPost AI is a small internship project inspired by the kind of workflow a team at Inspire AI would build. It helps a user turn writing samples, reference material, and niche trends into social content drafts that sound authentic and can be reviewed before publishing.

## Problem statement

Many professionals understand their domain but do not have the time to write consistently. Generic AI writing tools often produce content that sounds flat, repetitive, or detached from the user's real voice.

## Goal

Build a compact but realistic content system that demonstrates modern AI engineering practices:

- voice learning from examples
- retrieval-augmented generation
- trend discovery and ranking
- multi-step prompt orchestration
- quality review before output
- a usable dashboard for review and planning

## Success criteria

The project is successful if a reviewer can:

1. paste 5 to 10 writing samples
2. see a structured voice profile
3. select a trend topic
4. generate a draft in a consistent tone
5. review and save the draft to a calendar view

## Functional scope

### Voice Learning

- accept writing samples
- extract style traits such as tone, sentence length, CTA style, and formality
- store the resulting voice profile

### Knowledge Base

- accept user documents or text snippets
- chunk and index them for retrieval
- retrieve relevant context before generation

### Trend Intelligence

- pull public trend signals from free sources
- rank topics by relevance and freshness
- pass the best topic into the generation pipeline

### Draft Pipeline

- create a content plan before generation
- generate a first draft
- run a reviewer pass
- refine the draft when needed

### Dashboard

- display the voice profile
- show trend suggestions
- let the user review and edit generated drafts
- store approved posts in a calendar view

## Out of scope for this cycle

- direct publishing to LinkedIn, X, or Instagram
- payments or subscriptions
- team-level permissions
- production analytics with external integrations

## Team split

### Voice and retrieval workstream

Owns voice learning, profile extraction, and retrieval services.

### Trends and generation workstream

Owns trend discovery, planning, and generation orchestration.

### Frontend and integration workstream

Owns the React dashboard, service integration, and presentation layer.

## Timeline

### Week 1

- finalize scope
- freeze API contracts
- create repo structure
- agree on module ownership
- confirm the demo flow

### Weeks 2 to 3

- build backend foundation
- create first voice profile service
- establish trend service skeleton
- define the API responses
- connect the first local mock data

### Weeks 4 to 5

- connect retrieval and generation
- ship review flow
- wire frontend to backend
- add save/edit behavior in the UI
- tighten error handling

### Weeks 6 to 8

- testing
- UI polish
- documentation
- demo preparation
- final walkthrough
