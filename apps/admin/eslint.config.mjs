import { FlatCompat } from "@eslint/eslintrc";
import baseConfig from "@zenzoo/config/eslint.config.js";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [...baseConfig, ...compat.extends("next/core-web-vitals", "next/typescript")];

export default config;
