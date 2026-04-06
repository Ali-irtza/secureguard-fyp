

## Plan: FAQ Updates + Auth Page Changes

### Files to Modify
| File | Action |
|------|--------|
| `src/components/landing/FAQ.tsx` | Update 3 FAQ answers |
| `src/components/auth/RegisterForm.tsx` | Add "Full Name" field |
| `src/components/auth/LoginForm.tsx` | Add "Continue with Google" button |

---

### Changes

**1. FAQ Updates (`FAQ.tsx`)**

- **"What programming languages are supported?"** — Remove the sentence "We're actively working on adding support for JavaScript, TypeScript, Go, and Rust." Keep the rest.
- **"How secure is my code during scanning?"** — Rewrite to reflect that code IS stored securely for rescanning: "Your code is stored in encrypted, isolated containers so you can rescan anytime without re-uploading. We use end-to-end encryption for all data transfers, and our infrastructure is SOC 2 Type II certified. Only you and your authorized team members can access your stored code."
- **"Can I integrate with my CI/CD pipeline?"** — Replace with a new FAQ, e.g. **"Can I rescan my projects later?"** with answer: "Yes! Once you upload your code, it's securely stored so you can rescan at any time. You can also schedule automatic rescans to catch new vulnerabilities as our detection models improve."

**2. Register Form — Add Name Field (`RegisterForm.tsx`)**

- Add `fullName: z.string().min(2, "Name must be at least 2 characters")` to schema
- Add a "Full Name" form field with `User` icon before the email field, placeholder "John Doe"
- Add "Continue with Google" button below the GitHub button (same outline style, with a Google SVG/icon)

**3. Login Form — Add Google Button (`LoginForm.tsx`)**

- Add "Continue with Google" button below the existing GitHub button, same outline style
- Mock toast on click: "Connect Supabase to enable Google authentication."

