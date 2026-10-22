// Conventional Commits (https://www.conventionalcommits.org). Enforced on PR
// titles in CI (squash merges make the title the commit release-please reads).
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
