# UI/UX Specifications

## NPM Gallery - VS Code Extension

This document defines the user interface design, user experience flows, and interaction patterns for the NPM Gallery extension across multiple package sources and ecosystems.

---

## Table of Contents
1. [Design Principles](#1-design-principles)
2. [Visual Design System](#2-visual-design-system)
3. [Layout Structure](#3-layout-structure)
4. [Components](#4-components)
5. [User Flows](#5-user-flows)
6. [Interaction Patterns](#6-interaction-patterns)
7. [Accessibility](#7-accessibility)
8. [Responsive Behavior](#8-responsive-behavior)
9. [Error States](#9-error-states)
10. [Animations & Transitions](#10-animations--transitions)

---

## 1. Design Principles

### 1.1 Core Principles

| Principle | Description |
|-----------|-------------|
| **Native Feel** | Match VS Code's look and feel; feel like a built-in feature |
| **Information Density** | Show relevant info without overwhelming |
| **Progressive Disclosure** | Surface important info first, details on demand |
| **Speed** | Perceived performance through loading states and optimistic UI |
| **Accessibility** | Keyboard navigable, screen reader friendly |

### 1.2 Design Goals
1. **Reduce friction** - Minimize clicks to accomplish tasks
2. **Build confidence** - Show security/quality info before decisions
3. **Maintain context** - Don't disrupt the user's workflow
4. **Guide decisions** - Highlight important information visually

---

## 2. Visual Design System

### 2.1 Color Palette
Use VS Code's CSS variables for theme compatibility:

```css
/* Primary Colors */
--vscode-button-background          /* Primary action */
--vscode-button-foreground          /* Primary action text */
--vscode-button-hoverBackground     /* Primary hover */

/* Secondary Colors */
--vscode-button-secondaryBackground /* Secondary action */
--vscode-button-secondaryForeground /* Secondary text */

/* Status Colors */
--vscode-testing-iconPassed         /* Success/safe */
--vscode-testing-iconFailed         /* Error/danger */
--vscode-editorWarning-foreground   /* Warning */
--vscode-editorInfo-foreground      /* Information */

/* Surface Colors */
--vscode-editor-background          /* Main background */
--vscode-sideBar-background         /* Panel background */
--vscode-input-background           /* Input fields */
--vscode-list-hoverBackground       /* Hover state */
--vscode-list-activeSelectionBackground /* Selected */

/* Text Colors */
--vscode-foreground                 /* Primary text */
--vscode-descriptionForeground      /* Secondary text */
--vscode-disabledForeground         /* Disabled text */
```

### 2.2 Typography
```css
/* Font Family - Inherit from VS Code */
font-family: var(--vscode-font-family);

/* Font Sizes */
--font-size-xs: 10px;    /* Badges, labels */
--font-size-sm: 11px;    /* Secondary text */
--font-size-md: 13px;    /* Body text (VS Code default) */
--font-size-lg: 16px;    /* Section headers */
--font-size-xl: 20px;    /* Page titles */

/* Font Weights */
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-bold: 600;

/* Line Heights */
--line-height-tight: 1.2;
--line-height-normal: 1.5;
--line-height-relaxed: 1.7;
```

### 2.3 Spacing System
```css
/* Base unit: 4px */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
```

### 2.4 Border Radius
```css
--radius-sm: 2px;   /* Small elements */
--radius-md: 4px;   /* Cards, inputs */
--radius-lg: 6px;   /* Modals */
--radius-full: 50%; /* Circular elements */
```

### 2.5 Shadows
```css
/* Subtle elevation for dropdowns, tooltips */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.15);
--shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.2);
```

---

## 3. Layout Structure

### 3.1 Activity Bar Integration
```
┌─────────────────────────────────────────────────────────────────┐
│ VS Code Window                                                   │
├──────┬──────────────────────────────────────────────────────────┤
│      │                                                           │
│  📦  │   ┌───────────────────────────────────────────────────┐  │
│      │   │                NPM Gallery Panel                   │  │
│ Icon │   ├───────────────────────────────────────────────────┤  │
│      │   │  🔍 Search packages...                            │  │
│      │   ├───────────────────────────────────────────────────┤  │
│      │   │                                                   │  │
│      │   │              [Search Results]                     │  │
│      │   │                                                   │  │
│      │   └───────────────────────────────────────────────────┘  │
│      │                                                           │
└──────┴──────────────────────────────────────────────────────────┘
```

### 3.2 Panel Layout - Search View
```
┌─────────────────────────────────────────┐
│ NPM Gallery                         [⚙️] │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Search packages...         [🔧]  │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Sort: [Relevance ▼]  Found: 1,234       │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 📦 lodash               v4.17.21   │ │
│ │ A modern JavaScript utility...      │ │
│ │ ⬇️ 14.5M/month  📊 98  📦 72KB  🛡️ Safe │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📦 lodash-es            v4.17.21   │ │
│ │ Lodash exported as ES modules...    │ │
│ │ ⬇️ 3.2M/month  📊 85  📦 89KB  🛡️ Safe  │ │
│ └─────────────────────────────────────┘ │
│                 ...                      │
└─────────────────────────────────────────┘
```

### 3.3 Panel Layout - Package Details
```
┌─────────────────────────────────────────┐
│ ← lodash                            [⚙️] │
├─────────────────────────────────────────┤
│                                         │
│  📦 lodash                              │
│  A modern JavaScript utility library    │
│  delivering modularity, performance     │
│  & extras.                              │
│                                         │
│  v4.17.21 • MIT • 2 years ago           │
│                                         │
│  ┌─────────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Install ▼  │ │ Registry ↗│ │ GitHub ↗ │ │
│  └─────────────┘ └──────────┘ └──────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ ⬇️ 14.5M/month │ ⭐ 57.2K │ 📦 72KB    │
│ 🛡️ 0 vulnerabilities                   │
├─────────────────────────────────────────┤
│ [README] [Versions] [Deps] [Security]   │
├─────────────────────────────────────────┤
│                                         │
│  # Lodash                               │
│                                         │
│  A modern JavaScript utility library    │
│  delivering modularity, performance,    │
│  & extras.                              │
│                                         │
│  ## Installation                        │
│  ```                                    │
│  Install or copy the source-aware       │
│  dependency declaration                 │
│  ```                                    │
│                                         │
└─────────────────────────────────────────┘
```

### 3.4 Editor Integration Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ supported manifest                                               │
├─────────────────────────────────────────────────────────────────┤
│   {                                                              │
│     "name": "my-project",                                        │
│ 3 updates available | Update All                                 │
│     "dependencies": {                                            │
│       "lodash": "^4.17.20",  ← ──────┐ Update to 4.17.21        │
│       "express": "^4.18.2"           │                           │
│     }                                │                           │
│   }                                  │                           │
│                                      ▼                           │
│                    ┌────────────────────────────────┐            │
│                    │ 📦 lodash                      │            │
│                    │ A modern JavaScript utility... │            │
│                    ├────────────────────────────────┤            │
│                    │ Installed: 4.17.20            │            │
│                    │ Latest:    4.17.21 ⚠️ Update  │            │
│                    │ Downloads: 14.5M/month        │            │
│                    │ Size:      72KB (gzipped)     │            │
│                    │ License:   MIT ✓              │            │
│                    │ Security:  No vulnerabilities │            │
│                    ├────────────────────────────────┤            │
│                    │ [Update] [Remove] [Details]   │            │
│                    └────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Components

### 4.1 Search Bar
```
┌──────────────────────────────────────────────────────┐
│ 🔍 │ Search packages...                        │ ⚙️  │
└──────────────────────────────────────────────────────┘
      ↑                                           ↑
   Icon                                      Filter button

States:
- Default: Placeholder text visible
- Focused: Border highlight, placeholder fades
- With text: Clear button appears (×)
- Loading: Spinner replaces icon
```

**Specifications**:
- Height: 28px
- Padding: 6px 8px
- Border radius: 4px
- Icon size: 14px
- Debounce: 300ms

### 4.2 Package Card (Search Result)
```
┌─────────────────────────────────────────────────────┐
│  📦  lodash                              v4.17.21  │
│      ─────────                                     │
│      A modern JavaScript utility library           │
│      delivering modularity, performance...         │
│                                                    │
│      ⬇️ 14.5M/month  📊 98  📦 72KB  🛡️ Safe      │
└─────────────────────────────────────────────────────┘

Hover state:
┌─────────────────────────────────────────────────────┐
│  📦  lodash                              v4.17.21  │ ← Background
│      ─────────                           [Install] │   change
│      A modern JavaScript utility library           │
│      delivering modularity, performance...         │ ← Quick
│                                                    │   install
│      ⬇️ 14.5M/month  📊 98  📦 72KB  🛡️ Safe      │   button
└─────────────────────────────────────────────────────┘
```

**Specifications**:
- Padding: 12px
- Gap between cards: 2px
- Title: font-size-md, font-weight-medium
- Description: font-size-sm, max 2 lines, ellipsis
- Metrics: font-size-xs, icon 12px

### 4.3 Metric Badges
```
Downloads:      ⬇️ 14.5M/month  (icon + formatted number)
Score:          📊 98           (icon + 0-100 score)
Size:           📦 72KB         (icon + formatted size)
Security:       🛡️ Safe         (icon + status text)
                🛡️ 2 vulns      (icon + count, colored)
```

**Color Coding**:
- Safe/Good: Green (`--vscode-testing-iconPassed`)
- Warning: Yellow (`--vscode-editorWarning-foreground`)
- Critical: Red (`--vscode-testing-iconFailed`)

### 4.4 Install Button & Dropdown
```
Default state:
┌───────────────┐
│   Install ▼   │
└───────────────┘

Dropdown open:
┌───────────────┐
│   Install ▼   │
├───────────────┤
│ dependencies  │ ← Default
│ devDeps       │
│ peerDeps      │
├───────────────┤
│ Pick version..│
└───────────────┘
```

### 4.5 Tab Navigation
```
Active state:     [README]  Versions   Deps   Security
                  ────────
                  ↑ Underline indicator

Inactive state:   README  [Versions]  Deps   Security
                          ──────────
```

**Specifications**:
- Height: 32px
- Tab padding: 8px 12px
- Active indicator: 2px bottom border
- Active color: `--vscode-focusBorder`

### 4.6 Version List Item
```
┌─────────────────────────────────────────────────────┐
│  4.17.21    2 years ago    [latest]     [Install]  │
├─────────────────────────────────────────────────────┤
│  4.17.20    2 years ago                 [Install]  │
├─────────────────────────────────────────────────────┤
│  4.17.19    3 years ago    deprecated   [Install]  │
│  ──────────────────────────────────────────────────│
│  ↑ Strikethrough for deprecated                    │
└─────────────────────────────────────────────────────┘
```

### 4.7 Security Alert Card
```
Critical severity:
┌─────────────────────────────────────────────────────┐
│ 🔴 Critical: Prototype Pollution                    │
├─────────────────────────────────────────────────────┤
│ CVE-2021-23337 • CVSS 7.2                          │
│                                                     │
│ Lodash versions prior to 4.17.21 are vulnerable   │
│ to prototype pollution via the template function.  │
│                                                     │
│ Fix: Upgrade to lodash@4.17.21 or later           │
│                                                     │
│ [View Details ↗]                   [Update Now]    │
└─────────────────────────────────────────────────────┘

Color coding by severity:
- Critical: Red background tint
- High: Orange background tint
- Moderate: Yellow background tint
- Low: Blue background tint
```

### 4.8 Install Modal
```
┌─────────────────────────────────────────────────────┐
│ Install lodash                                   ✕ │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Version                                             │
│ ┌─────────────────────────────────────────────────┐│
│ │ 4.17.21 (latest)                              ▼ ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Save as                                             │
│ ○ dependencies                                      │
│ ● devDependencies                                   │
│ ○ peerDependencies                                  │
│                                                     │
│ Tooling                                             │
│ ┌─────────────────────────────────────────────────┐│
│ │ Auto-detected format                          ▼ ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ ⚠️ This package adds 72KB to your bundle           │
│                                                     │
├─────────────────────────────────────────────────────┤
│                        [Cancel]         [Install]   │
└─────────────────────────────────────────────────────┘
```

---

## 5. User Flows

### 5.1 Search & Install Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Open      │────▶│   Type      │────▶│   View      │
│   Panel     │     │   Query     │     │   Results   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌─────────────┐     ┌──────▼──────┐
                    │   Click     │◀────│   Browse    │
                    │   Package   │     │   Results   │
                    └──────┬──────┘     └─────────────┘
                           │
                    ┌──────▼──────┐     ┌─────────────┐
                    │   Review    │────▶│   Click     │
                    │   Details   │     │   Install   │
                    └─────────────┘     └──────┬──────┘
                                               │
                    ┌─────────────┐     ┌──────▼──────┐
                    │   Done!     │◀────│   Confirm   │
                    │   Message   │     │   Options   │
                    └─────────────┘     └─────────────┘
```

### 5.2 Manifest Hover Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Open      │────▶│   Hover     │────▶│   View      │
│   File      │     │   Package   │     │   Info      │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           │                   │                   │
                    ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
                    │   Click     │     │   Click     │     │   Click     │
                    │   Update    │     │   Details   │     │   Remove    │
                    └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │                   │
                    ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
                    │   Package   │     │   Open      │     │   Confirm   │
                    │   Updated   │     │   Panel     │     │   Remove    │
                    └─────────────┘     └─────────────┘     └─────────────┘
```

### 5.3 Security Audit Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Run       │────▶│   Scanning  │────▶│   View      │
│   Audit     │     │   Progress  │     │   Results   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
           ┌───────────────────────────────────┴───────────────────────────────────┐
           │                                                                        │
    ┌──────▼──────┐                                                         ┌──────▼──────┐
    │   No        │                                                         │   Vulns     │
    │   Issues    │                                                         │   Found     │
    └──────┬──────┘                                                         └──────┬──────┘
           │                                                                        │
    ┌──────▼──────┐     ┌─────────────┐     ┌─────────────┐              ┌──────▼──────┐
    │   Success   │     │   Click     │◀────│   Review    │◀─────────────│   Show      │
    │   Message   │     │   Fix All   │     │   Each      │              │   Details   │
    └─────────────┘     └──────┬──────┘     └─────────────┘              └─────────────┘
                               │
                        ┌──────▼──────┐
                        │   Fixed!    │
                        │   Message   │
                        └─────────────┘
```

---

## 6. Interaction Patterns

### 6.1 Keyboard Navigation
```
Tab Order:
1. Search input
2. Filter button
3. Sort dropdown
4. Search results (arrow keys within)
5. Package details tabs
6. Action buttons

Keyboard Shortcuts:
- Ctrl+K       Focus search (within panel)
- Enter        Select/activate focused item
- Escape       Clear search / go back
- Arrow Up/Down Navigate list
- Space        Toggle checkbox/radio
```

### 6.2 Click Behaviors
```
Single click:
- Package card → Show details
- Tab → Switch tab
- Button → Execute action

Double click:
- Package card → Quick install (latest, dependencies)

Right click:
- Package card → Context menu
- dependency entry in a supported manifest → Context menu
```

### 6.3 Drag & Drop
```
Drag package from:
- Search results
- Installed packages view

Drop onto:
- supported manifest file → Add dependency or copy declaration
- Terminal → Generate install command
```

### 6.4 Tooltips
```
Trigger: Hover for 500ms
Position: Above element, centered
Max width: 300px

Examples:
- Download count → "45,123,456 downloads in the last 7 days"
- Score badge → "Quality: 99, Popularity: 98, Maintenance: 93"
- Size badge → "72KB minified, 24KB gzipped"
```

---

## 7. Accessibility

### 7.1 ARIA Labels
```html
<!-- Search input -->
<input
  type="search"
  role="searchbox"
  aria-label="Search packages"
  aria-describedby="search-hint"
/>
<span id="search-hint" class="sr-only">
  Type to search, use arrow keys to navigate results
</span>

<!-- Results list -->
<ul role="listbox" aria-label="Search results">
  <li role="option" aria-selected="true">...</li>
</ul>

<!-- Tab panel -->
<div role="tablist" aria-label="Package information">
  <button role="tab" aria-selected="true" aria-controls="readme-panel">
    README
  </button>
</div>
<div role="tabpanel" id="readme-panel" aria-labelledby="readme-tab">
  ...
</div>
```

### 7.2 Focus Management
```
Focus ring: 2px solid var(--vscode-focusBorder)
Focus offset: 2px

Focus trap in modals:
- Tab cycles through modal elements
- Escape closes modal
- Focus returns to trigger element
```

### 7.3 Screen Reader Announcements
```javascript
// Announce search results
announceToScreenReader(`Found ${count} packages for "${query}"`);

// Announce installation status
announceToScreenReader(`Installing ${packageName}...`);
announceToScreenReader(`Successfully installed ${packageName}`);

// Announce security findings
announceToScreenReader(`Found ${count} security vulnerabilities`);
```

### 7.4 Color Contrast
- Text on background: Minimum 4.5:1 ratio
- Large text: Minimum 3:1 ratio
- Interactive elements: Clear visual distinction
- Don't rely solely on color to convey information

---

## 8. Responsive Behavior

### 8.1 Panel Width Breakpoints
```
Narrow (< 250px):
- Stack metrics vertically
- Truncate descriptions more aggressively
- Hide secondary actions

Medium (250-400px):
- Default layout
- Two metrics per row
- Show all primary actions

Wide (> 400px):
- Expanded layout
- All metrics in row
- Show secondary info
```

### 8.2 Content Adaptation
```
Narrow panel:
┌─────────────────────┐
│ 📦 lodash  v4.17.21│
│ A modern JavaScript│
│ utility library... │
│ ⬇️ 14.5M  📊 98    │
│ 📦 72KB  🛡️ Safe   │
└─────────────────────┘

Wide panel:
┌─────────────────────────────────────────────────────┐
│ 📦 lodash                                  v4.17.21│
│ A modern JavaScript utility library delivering     │
│ modularity, performance & extras.                  │
│ ⬇️ 14.5M/month  📊 98  📦 72KB  🛡️ Safe           │
└─────────────────────────────────────────────────────┘
```

---

## 9. Error States

### 9.1 Search Errors
```
No results:
┌─────────────────────────────────────────┐
│            🔍                            │
│     No packages found for               │
│     "asdfqwerty"                        │
│                                         │
│     Try different keywords or           │
│     check your spelling                 │
└─────────────────────────────────────────┘

Network error:
┌─────────────────────────────────────────┐
│            ⚠️                            │
│     Unable to search packages           │
│                                         │
│     Check your internet connection      │
│                                         │
│          [Try Again]                    │
└─────────────────────────────────────────┘

Rate limited:
┌─────────────────────────────────────────┐
│            ⏳                            │
│     Too many requests                   │
│                                         │
│     Please wait 60 seconds              │
│     before searching again              │
│                                         │
│     [Retry in 45s]                      │
└─────────────────────────────────────────┘
```

### 9.2 Installation Errors
```
Install failed:
┌─────────────────────────────────────────┐
│ ❌ Installation Failed                   │
├─────────────────────────────────────────┤
│                                         │
│ Could not install lodash@4.17.21        │
│                                         │
│ Error: ERESOLVE unable to resolve       │
│ dependency tree                         │
│                                         │
│ [View Full Error]     [Try Again]       │
└─────────────────────────────────────────┘
```

### 9.3 Package Not Found
```
┌─────────────────────────────────────────┐
│            📦❓                          │
│                                         │
│     Package "unknownpkg" not found      │
│                                         │
│     It may have been unpublished        │
│     or the name is incorrect            │
│                                         │
│     [Search for similar]                │
└─────────────────────────────────────────┘
```

---

## 10. Animations & Transitions

### 10.1 Transition Timings
```css
/* Quick transitions for micro-interactions */
--transition-fast: 100ms ease-out;

/* Standard transitions */
--transition-normal: 200ms ease-out;

/* Slower transitions for larger elements */
--transition-slow: 300ms ease-out;
```

### 10.2 Loading States
```
Search loading:
┌─────────────────────────────────────────┐
│ ⟳ │ lodash                              │  ← Spinner in icon
└─────────────────────────────────────────┘

Results loading:
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░   │ │  ← Skeleton
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░   │ │
│ │ ▓▓▓▓░░░░  ▓▓▓░░  ▓▓▓▓░░  ▓▓▓░░    │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░   │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░   │ │
│ │ ▓▓▓▓░░░░  ▓▓▓░░  ▓▓▓▓░░  ▓▓▓░░    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

Pulse animation on skeleton:
opacity: 0.5 → 1 → 0.5 (1.5s loop)
```

### 10.3 Installation Progress
```
Preparing:
┌─────────────────────────────────────────┐
│ Installing lodash@4.17.21...            │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%    │
└─────────────────────────────────────────┘

In progress:
┌─────────────────────────────────────────┐
│ Installing lodash@4.17.21...            │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░ 50%   │
└─────────────────────────────────────────┘

Complete:
┌─────────────────────────────────────────┐
│ ✓ Installed lodash@4.17.21              │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100%  │
└─────────────────────────────────────────┘

Animation: Fade out after 2s
```

### 10.4 View Transitions
```
Panel navigation (back/forward):
- Slide transition (200ms)
- Direction based on navigation

Tab switching:
- Content cross-fade (150ms)
- Tab indicator slide (200ms)

Modal:
- Fade in background (200ms)
- Scale up content (200ms, 0.95 → 1)
```

---

## Appendix: Component Library Reference

### Icon Reference
| Icon | Unicode | Usage |
|------|---------|-------|
| 📦 | U+1F4E6 | Package |
| 🔍 | U+1F50D | Search |
| ⬇️ | U+2B07 | Downloads |
| 📊 | U+1F4CA | Score/stats |
| 🛡️ | U+1F6E1 | Security |
| ⭐ | U+2B50 | Stars/rating |
| ⚠️ | U+26A0 | Warning |
| ✓ | U+2713 | Success/check |
| ✕ | U+2715 | Close/remove |
| ↗ | U+2197 | External link |

### Figma Design File
[Link to Figma design file - to be added]

### Interactive Prototype
[Link to prototype - to be added]
