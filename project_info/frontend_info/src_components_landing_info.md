# Frontend Landing Page Components Documentation

## Overview
The landing components directory contains 15 React/TypeScript files that compose the public-facing marketing landing page. These components showcase SecureGuard's features, build trust through social proof, and guide users toward authentication and onboarding.

---

## 1. **AnimatedFeaturesGrid.tsx** (72 lines)

### Purpose
Displays three core security features in an animated grid layout that appears as users scroll into view.

### Features Displayed
1. **AI Function Analysis** - Deep learning models detect complex vulnerabilities
2. **Real-time Reporting** - Instant feedback with severity ratings and fixes
3. **GitHub Integration** - Auto-scan on push, CI/CD integration

### Animation & Behavior
- **Scroll-triggered reveal** - Uses `useInView` hook to detect when section enters viewport
- **Staggered animation** - Each card appears sequentially (200ms + 150ms delays)
- **Card interactions:**
  - Icon background color transitions on hover
  - Icon rotates 12° on hover
  - Border changes to emerald on hover
  - Smooth 500ms transitions

### Component Structure
- **useInView hook** - Tracks when component scrolls into view
- **Card styling:**
  - Glass-morphism effect (backdrop-blur)
  - Semi-transparent white background (5% opacity)
  - Hover glow effects
  - Responsive 3-column grid

### No Backend Connections
- Pure presentation component
- Data hardcoded in features array

---

## 2. **AnimatedFooter.tsx** (90 lines)

### Purpose
Interactive footer with animated links, social icons, and enhanced styling for dark theme landing page.

### Sections
1. **Logo Area** - SecureGuard Pro branding with glow effect on hover
2. **Navigation Links:**
   - About, Privacy, Terms, Contact
   - Animated underline on hover (width transitions from 0 to 100%)
   - Smooth color transition to emerald

3. **Social Icons:**
   - GitHub, Twitter, LinkedIn
   - Hover glow effect with drop shadow
   - Color transitions

4. **Copyright** - Dynamic year using `new Date().getFullYear()`

### Design Features
- **Gradient border** - Top decorative border from transparent emerald
- **Background gradient** - From emerald-950 to transparent
- **Hover animations:**
  - Links: width-sliding underline
  - Icons: drop-shadow glow
  - Logo: glow effect

### Backend Connections
- **Navigation:**
  - Links use `react-router-dom` Link components
  - Routes: /about, /privacy, /terms, /contact
  - Not implemented (placeholder routes)

- **Scroll tracking:**
  - `useInView` hook - Fade in animation on scroll

---

## 3. **AnimatedHero.tsx** (186 lines - Second Largest)

### Purpose
Main hero section with animated headline, statistics counters, and call-to-action. Features sophisticated entrance animations and interactive counters.

### Key Sections

#### Floating Badge
- "AI-Powered Security Analysis" indicator
- Animated ping/pulse effect
- Float animation with 4s infinite loop

#### Animated Headline
- **Regular words:** "Secure Your Code with" - fade-in with stagger delay
- **Highlight words:** "AI-Driven Precision" - gradient text animation
- 6 separate span animations with cascading delays (100ms increments)

#### Subheading
- Blur-to-sharp transition effect
- Fades in from blur (blur-sm) to clear (blur-0)
- 800ms transition delay

#### CTA Button
- "Scan Code Now" with arrow icon
- Arrow animates with translate-x on hover
- Gradient overlay animation on hover (slides background)
- Routes to `/auth` page via `useNavigate()`

#### Animated Statistics Cards
Three cards displaying metrics with animated counters:

1. **50K+ Scans Completed** - Shield icon
2. **99.9% Detection Rate** - Target icon
3. **2.5s Avg Scan Time** - Zap icon

**AnimatedCounter Sub-Component:**
- Custom counter animation using `requestAnimationFrame`
- Easing function: cubic acceleration-deceleration (ease-out-cubic)
- Only animates once when scrolled into view (`useInView`)
- 2000ms animation duration (configurable)
- Formats large numbers with commas

### Animations Used
- Staggered slide-up with varying delays (1200ms-1500ms)
- Icon rotation animations on hover
- Stat card hover scale (1.02) and translate-y
- Glow shadow effects

### Backend Connections
- **Navigation:** `useNavigate()` for `/auth` route
- **No data fetching** - All values hardcoded

---

## 4. **AnimatedNavbar.tsx** (102 lines)

### Purpose
Fixed navigation bar with scroll-aware styling, mobile responsiveness, and smooth scrolling to page sections.

### Features

#### Scroll Detection
- Triggers at `window.scrollY > 20`
- Changes background from transparent to blurred with border
- Shadow appears on scroll

#### Desktop Navigation
- Smooth scroll to sections: #features, #how-it-works, #faq
- Each link has animated underline on hover (width: 0 → 100%)
- "Get Started" button with gradient animation

#### Mobile Navigation
- Hamburger menu (Menu/X icons)
- Collapsible menu with smooth max-height transition (300ms)
- Same navigation items, full-width button

#### Logo Animation
- **Scan line effect** - Gradient overlay animates on hover (plays scan-logo animation)
- Icon scales 110% on hover
- "SecureGuard Pro" text

### Functionality
```javascript
const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  setIsOpen(false);  // Close mobile menu
}
```

### Styling Strategy
- Fixed positioning (z-50)
- Responsive: hidden md:flex for desktop nav
- Button has gradient shift animation on hover

### Backend Connections
- **No direct API calls**
- Navigation uses client-side scroll, not page navigation

---

## 5. **CyberBackground.tsx** (231 lines - Largest & Most Complex)

### Purpose
Advanced canvas-based animated background with particle physics, geometric shapes, parallax effects, and mouse interactions. Creates cyberpunk aesthetic with real-time animations.

### Technical Implementation

#### Canvas Setup
- Full-screen canvas (fixed position, pointer-events-none)
- Automatic resize on window resize
- Linear gradient background (0a0a0f → 0d1117)

#### Particles System (80 particles)
- **Physics:**
  - Random velocity (-0.5 to +0.5 per axis)
  - Size: 1-3 pixels
  - Opacity: 0.1-0.6
  - Wrap around edges

- **Rendering:**
  - Filled circles with emerald color
  - **Connections:** Lines between particles < 120px distance
  - Opacity scales with distance (1 - distance/120) * 0.15

#### Geometric Shapes (5 rotating polygons)
- **Hexagon** (6 sides) at 20%, 30% - rotates clockwise
- **Octagon** (8 sides) at 80%, 60% - rotates counterclockwise
- **Dodecagon** (12 sides) at 50%, 80% - slight clockwise rotation
- **Multiple blurred layers** - depth effect with varying opacity

- **Properties:**
  - Varying blur amounts (20px-40px)
  - Opacity ranges (0.025-0.04)
  - Depth values affect parallax amount
  - Different rotation speeds

#### Parallax Effect
- Mouse position tracked: `(clientX / window.innerWidth - 0.5) * 2`
- Applied to shapes: `parallaxX = mouse.x * 30 * shape.depth`
- Applied to particles: `parallaxX = mouse.x * 10` (subtle)

#### Scan Beam Animation
- Horizontal beam traverses screen (left to right)
- Speed: 0.5 pixels per frame
- Gradient: transparent → emerald (0.08) → transparent
- Width: 200px (100px margins)
- Loops infinitely

#### Accessibility
- Checks `prefers-reduced-motion` media query
- If motion disabled: static render without animation

### Performance Optimization
- Single requestAnimationFrame loop
- Efficient particle distance calculations
- Canvas context reuse
- Cleanup: cancels animation frame, removes event listeners

### Backend Connections
- **None** - Pure visual effect component

---

## 6. **FAQ.tsx** (64 lines)

### Purpose
Frequently Asked Questions section using accordion UI for expandable Q&A pairs.

### Content Provided

**Q1: What programming languages are supported?**
- A: "SecureGuard Pro currently supports C and C++ with deep analysis capabilities"

**Q2: How secure is my code during scanning?**
- A: "Code stored in encrypted isolated containers. End-to-end encryption for transfers. Only you and authorized team members can access."

**Q3: How does the AI-driven analysis detect vulnerabilities?**
- A: "FastAPI backend with specialized AI models generates comprehensive Vulnerability Report categorized by severity"

### Component Structure
- **Accordion:** Collapsible sections (type="single", collapsible)
- **Styling:**
  - Semi-transparent white background (5%)
  - Backdrop blur
  - Emerald accent color on trigger arrow
  - Rounded corners with padding

### Functionality
- One item open at a time
- Smooth expand/collapse animation
- Border/background color styling

### Backend Connections
- **No data fetching** - FAQs hardcoded
- Could be extended to fetch from `/api/faqs` endpoint

---

## 7. **FeaturesGrid.tsx** (60 lines)

### Purpose
Non-animated alternative to AnimatedFeaturesGrid. Simple static grid displaying the same three features for pages without scroll animations.

### Features
- Same 3 features as AnimatedFeaturesGrid:
  - AI Function Analysis
  - Real-time Reporting
  - GitHub Integration

### Differences from AnimatedFeaturesGrid
- **No scroll detection** - Always visible
- **No staggered delays** - All cards render immediately
- **Simpler styling** - Still has hover-glow effect but no animation delays
- **Used on:** Alternate landing variations or fallback

### Styling
- 3-column responsive grid
- Card components with icon boxes
- Hover glow effects
- Cleaner, less animation-heavy

---

## 8. **FloatingCodeFragments.tsx** (82 lines)

### Purpose
Background effect showing floating code snippets and security terms moving diagonally across the screen. Creates sense of active security scanning.

### Floating Text Samples
- `scan()`, `vulnerability::detected`, `checksum: verified`
- `hash: validated`, `SSL: encrypted`, `threat: neutralized`
- `AI analysis: active`, `permissions: granted`, `firewall: active`
- `shield.protect()`, `security.scan()`, `auth: verified`
- `encrypt(data)`, `validate.input()`, `monitor.status()`

### Animation Properties
```typescript
interface CodeFragment {
  id: number;
  text: string;
  x: number;           // % from left (0-100)
  y: number;           // % from top (0-100)
  speed: number;       // 15-35 seconds (animation duration)
  opacity: number;     // 0.1-0.25 (subtle)
  blur: number;        // 0-2px blur filter
  delay: number;       // 0-10 seconds stagger
}
```

### Rendering
- **Position:** Fixed, absolute positioning with percentages
- **Animation:** `animate-float-diagonal` (CSS animation)
- **Duration:** 15-35 seconds
- **Delay:** 0-10 seconds per fragment
- **Opacity:** Very subtle (semi-transparent)
- **Font:** Monospace, xs size, emerald color

### Accessibility
- Respects `prefers-reduced-motion` - Returns null if user prefers reduced motion
- Pointer-events-none so doesn't interfere with interaction

### Backend Connections
- **None** - Pure visual decorative effect

---

## 9. **Footer.tsx** (46 lines)

### Purpose
Simple non-animated footer with links and social icons. Lightweight alternative to AnimatedFooter.

### Sections
1. **Logo** - Shield icon + "SecureGuard Pro"
2. **Navigation links** - About, Privacy, Terms, Contact (placeholder links)
3. **Social icons** - GitHub, Twitter, LinkedIn
4. **Copyright** - Dynamic year

### Styling
- Border-top separator
- Responsive flex layout (column on mobile, row on desktop)
- Hover color transitions (text → foreground)
- Muted foreground color for secondary text

### Differences from AnimatedFooter
- **No entrance animations**
- **No gradient borders**
- **No hover underline effects**
- **Simpler styling overall**
- **Used as:** Default footer alternative

### Backend Connections
- **No backend calls**
- Link hrefs are placeholders (#)

---

## 10. **HeroSection.tsx** (79 lines)

### Purpose
Static hero section with background image, headline, and statistics cards. Non-animated alternative to AnimatedHero.

### Layout
1. **Background Image** - `hero-minimal.png` at 40% opacity
2. **Dark overlay gradient** - Ensures text readability
3. **Headline** - "Secure Your Code with AI-Driven Precision"
   - "AI-Driven Precision" uses `text-gradient-emerald` class
4. **Subheading** - Description text
5. **CTA Button** - "Scan Code Now" routes to `/auth`
6. **Stats Cards** - Same 3 metrics as AnimatedHero (50K+, 99.9%, 2.5s)

### Styling
- Full min-height screen
- Center alignment
- Glass cards for stats
- Hover border transitions
- Icon background color transitions

### Differences from AnimatedHero
- **No counter animations** - Static values displayed
- **No scroll-triggered animations**
- **No floating badge** - Simpler header
- **Background image instead of vignette**
- **Fewer animation effects**

---

## 11. **HowItWorks.tsx** (100 lines)

### Purpose
Three-step process section showing user journey: Upload → Scan → Report. Features scroll-triggered animations and decorative connector lines.

### Three Steps

#### Step 1: Upload or Link Repo
- Icon: Upload
- Description: "Connect GitHub or upload files"

#### Step 2: AI Scanning
- Icon: Shield
- Description: "AI analyzes for vulnerabilities"

#### Step 3: Get Remediation Report
- Icon: FileText
- Description: "Comprehensive report with fixes"

### StepCard Sub-Component
- Scroll-triggered animations via `useInView`
- Numbered badge (01, 02, 03) positioned at top
- Icon box with background and border
- Hover effects:
  - Scale 1.02 (102%)
  - Translate -1px (up)
  - Box shadow with emerald glow
  - Border color to emerald

### Desktop Connector
- Gradient line connects cards
- Position: top 50%, left 33% → right 33%
- From transparent emerald → opaque emerald → transparent

### Mobile Connector
- Vertical arrow (rotate 90°) between cards
- Rotated to point downward

### Animation Timing
- Staggered: index * 150ms delays
- Slide-up effect with opacity transition

### Backend Connections
- **No data fetching**
- Uses `useInView` hook for scroll detection

---

## 12. **Navbar.tsx** (71 lines)

### Purpose
Simple navigation bar for landing pages. Non-animated alternative to AnimatedNavbar.

### Features
- **Logo:** Shield icon + "SecureGuard Pro"
- **Desktop nav:** Features, How it Works, FAQ links
  - Smooth scroll to sections
  - Hover text color transition
- **Mobile menu:** Collapsible with hamburger icon
- **CTA Button:** "Get Started" links to `/auth`

### Styling
- Fixed position with z-50
- Background/80 with backdrop blur
- Border-bottom separator
- Responsive: hidden md:flex for desktop

### Differences from AnimatedNavbar
- **No scroll detection** - Background always same
- **No animated underlines** - Simple text color transition
- **No logo scan effect**
- **Simpler overall** - No scroll-based changes

---

## 13. **SocialProof.tsx** (58 lines)

### Purpose
"Trusted by" section displaying logos of major companies (Google, Microsoft, GitHub, AWS, Meta, Stripe) in continuous scrolling carousel.

### Companies Featured
- Google
- Microsoft
- GitHub
- AWS
- Meta
- Stripe

### Implementation
- **SVG logos** - Inline SVG paths for each company
- **Scroll animation:** `animate-scroll` CSS animation
- **Duplicated logos** - Logos array rendered twice for seamless loop
- **Gradient masks:**
  - Left mask: Gradient from dark to transparent
  - Right mask: Gradient from transparent to dark
  - Width: 80px on each side
  - Ensures smooth fade at edges

### Styling
- Section with border-y (top and bottom borders)
- `z-10` positioning
- "Trusted by..." header text (uppercase, tracking)
- Overflow hidden container

### Logo Styling
- Grayscale by default
- Hover color transitions
- Drop shadow glow effects
- Flex shrink to maintain size

### Animation
- Continuous horizontal scroll
- Infinite loop due to duplicated content
- Respects reduced motion preferences (can be enhanced)

### Backend Connections
- **No backend calls**
- Logo data hardcoded

---

## 14. **TechStack.tsx** (63 lines)

### Purpose
Displays technology stack used in SecureGuard (C/C++, Docker, FastAPI, AWS) with icon and description for each.

### Technologies

1. **C / C++** (⚙️) - Core Analysis Engine
2. **Docker** (🐳) - Containerized Deployment
3. **FastAPI** (⚡) - High-Performance API
4. **AWS** (☁️) - Cloud Infrastructure

### Styling
- 2-column grid on mobile, 4-column on desktop
- Gap: 6
- Cards with white/5 background and white/10 border
- Rounded corners with padding

### Hover Effects
- Border color changes to emerald/40
- Icon: grayscale removed (grayscale-0)
- Smooth 300ms transitions

### Content Structure
- **Emoji icon** - Large 4xl text
- **Tech name** - Font semibold lg
- **Description** - Smaller gray text

### Backend Connections
- **No backend calls**
- Static technology list

---

## 15. **VignetteOverlay.tsx** (24 lines - Simplest)

### Purpose
Visual effect overlay creating dark edges around screen for cinematic depth. Adds subtle noise texture.

### Components

#### Main Vignette
- Fixed full-screen div
- Radial gradient: ellipse 80% × 60% at center
- Transparent center → dark edges (rgba 10,10,15, 0.3)
- z-index: 3

#### Noise Texture
- Fixed full-screen div
- SVG noise filter: fractalNoise
- Base frequency: 0.9
- Octaves: 4 (more detail)
- Opacity: 0.015 (very subtle)
- z-index: 4 (on top of vignette)

### Effect
- Darkens screen edges for cinematic look
- Adds subtle film grain effect
- Pointer-events-none so doesn't interfere
- Fixed positioning on all pages

### Backend Connections
- **None** - Pure visual effect

---

## Architecture Patterns Used

### 1. **Scroll-Triggered Animations**
- Components: AnimatedFeaturesGrid, AnimatedHero, HowItWorks
- Hook: `useInView({ threshold: 0.1-0.3 })`
- Pattern: Check `isInView` state, apply conditional CSS classes
- Smooth transition delays for staggered effects

### 2. **Canvas Animations**
- Component: CyberBackground
- RequestAnimationFrame loop for smooth 60fps
- Particle system with physics
- Mouse parallax tracking
- Performance optimization with frame-based updates

### 3. **Mobile Responsiveness**
- Components: AnimatedNavbar, Navbar, HeroSection
- Tailwind: `hidden md:flex` for desktop-only
- `md:hidden` for mobile-only elements
- Responsive grids: cols-1 sm:cols-2 md:cols-3 lg:cols-4

### 4. **Carousel/Scroll Effects**
- Component: SocialProof
- CSS animation with duplicated content
- Gradient masks for smooth edges
- Infinite animation loop

### 5. **State Management**
- Minimal local state (mostly UI state)
- useNavigate for routing
- useInView for visibility tracking
- useEffect for event listeners and cleanup

### 6. **Accessibility**
- CyberBackground: Respects `prefers-reduced-motion`
- FloatingCodeFragments: Disables animation if reduced motion
- Semantic HTML with proper heading hierarchy
- Color contrast maintained

---

## Component Relationships

### Landing Page Composition
```
LandingPage
├─ VignetteOverlay (fixed background)
├─ CyberBackground (fixed animated background)
├─ FloatingCodeFragments (fixed floating text)
├─ Navbar or AnimatedNavbar
├─ HeroSection or AnimatedHero
├─ FeaturesGrid or AnimatedFeaturesGrid
├─ SocialProof
├─ HowItWorks
├─ TechStack
├─ FAQ
└─ Footer or AnimatedFooter
```

### Component Variants
- **Animated vs. Static:** Each major section has animated and static variants
  - AnimatedHero ↔ HeroSection
  - AnimatedFeaturesGrid ↔ FeaturesGrid
  - AnimatedNavbar ↔ Navbar
  - AnimatedFooter ↔ Footer

---

## Shared Styling & Classes

### Custom CSS Classes
- `glow-emerald` - Glow shadow effect
- `text-gradient-animated` - Animated gradient text
- `text-gradient-emerald` - Emerald gradient
- `glass-card` - Semi-transparent card styling
- `feature-card-hover` - Custom hover effects
- `stat-card-hover` - Stat card hover effects
- `animate-float-diagonal` - Diagonal float animation
- `animate-scroll` - Horizontal scroll animation
- `gradient-cyber` - Cyberpunk background gradient

### Colors & Gradients
- **Primary:** Emerald (16, 185, 129)
- **Background:** Dark cyber colors (10, 10, 15)
- **Accent:** Emerald glow effects
- **Text:** White on dark, muted-foreground for secondary

### Responsive Breakpoints
- **sm:** 640px+
- **md:** 768px+ (desktop nav shows, mobile menu hides)
- **lg:** 1024px+

---

## Type Definitions

### Particle
```typescript
interface Particle {
  x: number;          // X coordinate
  y: number;          // Y coordinate
  vx: number;         // X velocity
  vy: number;         // Y velocity
  size: number;       // Radius in pixels
  opacity: number;    // 0-1 value
}
```

### CodeFragment
```typescript
interface CodeFragment {
  id: number;
  text: string;
  x: number;          // % left
  y: number;          // % top
  speed: number;      // Animation duration (seconds)
  opacity: number;    // Transparency
  blur: number;       // Blur filter px
  delay: number;      // Animation delay (seconds)
}
```

---

## External Dependencies

### UI Libraries
- `lucide-react` - Icons (Shield, Menu, Upload, etc.)
- Custom Card, Button components from `@/components/ui`
- Accordion component (collapsible UI)

### Utilities
- `react-router-dom` - Navigation (useNavigate, Link)
- `@/hooks/use-in-view` - Scroll detection hook
- Date utilities for copyright year

### Canvas API
- HTML5 Canvas for background animations
- requestAnimationFrame for smooth rendering
- Canvas context drawing methods

---

## Animation Techniques

### 1. CSS Transitions
- Property-based animations (opacity, transform, color)
- Duration: 300ms-1000ms
- Easing: ease-in-out, ease-out

### 2. CSS Keyframe Animations
- `animate-scroll` - Horizontal carousel
- `animate-float-diagonal` - Diagonal floating
- `animate-ping` - Pulsing dot
- `animate-scan-logo` - Logo scan effect

### 3. JavaScript RequestAnimationFrame
- CyberBackground particle physics
- AnimatedCounter number counting
- 60fps smooth animation loop

### 4. React State-Based
- AnimatedHero: Counter animations tied to state
- AnimatedNavbar: Scroll state changes styling
- Accordions: Toggle state for expand/collapse

---

## Performance Considerations

1. **Canvas Performance** (CyberBackground)
   - Efficient particle distance calculations
   - Single animation loop
   - Proper cleanup with cancellation

2. **Animation Performance**
   - GPU-accelerated transforms (translate, scale)
   - Avoid layout-triggering properties during animation
   - Staggered delays prevent simultaneous repaints

3. **Memory**
   - Fixed particle count (80)
   - One-time canvas setup
   - Automatic cleanup in useEffect returns

4. **Accessibility**
   - Motion preferences respected
   - Semantic HTML
   - Text alternatives for visual effects

---

## Summary

These 15 landing components create a sophisticated, animated marketing page that:
- **Showcases features** with AI security positioning
- **Builds trust** through social proof and testimonials
- **Guides users** toward authentication
- **Demonstrates technology** through visual effects
- **Maintains brand consistency** with emerald/cyberpunk theme
- **Optimizes performance** with canvas and GPU animations
- **Respects accessibility** with motion preferences

The landing page combines static and animated variants, allowing flexibility in how the marketing message is presented while maintaining a cohesive, professional appearance.
