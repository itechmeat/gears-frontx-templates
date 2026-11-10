declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.css?inline' {
  const text: string;
  export default text;
}
