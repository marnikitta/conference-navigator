import pluginVue from "eslint-plugin-vue";
import vueTsEslintConfig from "@vue/eslint-config-typescript";
import prettier from "@vue/eslint-config-prettier";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  ...pluginVue.configs["flat/recommended"],
  ...vueTsEslintConfig(),
  prettier,
  {
    rules: {
      "vue/multi-word-component-names": [
        "error",
        {
          ignores: ["Topbar", "Tabs", "Explore", "Schedule"],
        },
      ],
    },
  },
];
