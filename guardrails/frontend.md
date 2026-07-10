# Frontend Engineering Guidelines

When writing frontend code (React, Vue, HTML/CSS, etc.), adhere to these industry-standard practices:
1. **Components**: Write functional, reusable components. Avoid class components in React.
2. **Styling**: Prefer utility-first CSS (like TailwindCSS) or CSS Modules over global stylesheets to prevent style leakage.
3. **State Management**: Keep state as local as possible. Use React Hooks (`useState`, `useEffect`, `useMemo`) efficiently without causing unnecessary re-renders.
4. **Types**: Use TypeScript whenever possible to define props and state interfaces. Avoid `any`.
5. **Accessibility (a11y)**: Include semantic HTML elements and ARIA attributes where appropriate.
6. **Error Handling**: Implement graceful fallbacks for UI elements and handle API loading/error states explicitly.
