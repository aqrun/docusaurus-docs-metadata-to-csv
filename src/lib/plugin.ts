import { LoadContext, Plugin, PluginContentLoadedActions } from '@docusaurus/types';
import fs from 'fs-extra';
import globby from 'globby';
import { flatten } from 'lodash/fp';
import path from 'path';


import loadEnv from './env';
import processMetadata from './metadata';
import { Env, LoadedContent, PluginOptions } from './types';

const DEFAULT_OPTIONS: PluginOptions = {
  include: ['**/*.{md,mdx}'], // Extensions to include.
  path: 'docs', // Path to data on filesystem, relative to site dir.
  routeBasePath: 'docs', // URL Route.
};

export default function pluginContentLunr(
  context: LoadContext,
  opts: Partial<PluginOptions>,
): Plugin<LoadedContent | null> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const { siteDir } = context;
  const docsDir = path.resolve(siteDir, options.path);

  // Versioning
  const env: Env = loadEnv(siteDir);
  const { versioning } = env;
  const { versions, docsDir: versionedDir } = versioning;
  const versionsNames = versions.map(version => `version-${version}`);

  let allMetaData = null;

  return {
    name: 'docusaurus-docs-metadata-to-csv',

    getThemePath(): string {
      return path.resolve(__dirname, '../theme');
    },

    // tslint:disable-next-line: readonly-array
    getPathsToWatch(): string[] {
      const { include } = options;
      const globPattern = include.map(pattern => `${docsDir}/${pattern}`);
      const versionGlobPattern = (!versioning.enabled) ? [] : flatten(
        include.map(p => versionsNames.map(v => `${versionedDir}/${v}/${p}`))
      );
      return [...globPattern, ...versionGlobPattern];
    },

    async loadContent(): Promise<LoadedContent> {
      const { include } = options;

      // tslint:disable-next-line: no-if-statement
      if (!fs.existsSync(docsDir)) {
        return null;
      }

      // Metadata for default/ master docs files.
      const docsFiles = await globby(include, { cwd: docsDir } as any);
      const docsPromises = docsFiles.map(async source => processMetadata({
        context,
        env,
        options,
        refDir: docsDir,
        source,
      }));

      // Metadata for versioned docs
      // const versionedGlob = flatten(include.map(p => versionsNames.map(v => `${v}/${p}`)));
      // const versionedFiles = await globby(versionedGlob, { cwd: versionedDir });
      // const versionPromises = (!versioning.enabled) ? [] : versionedFiles.map(async source => processMetadata({
      //   context,
      //   env,
      //   options,
      //   refDir: versionedDir,
      //   source,
      // }));

      // const metadata = await Promise.all([...docsPromises, ...versionPromises]);
      const metadata = await Promise.all(docsPromises);
      return ({ metadata });
    },

    contentLoaded({
      content,
      actions
    }: {
      readonly content: LoadedContent,
      readonly actions: PluginContentLoadedActions
    }): void {
      const { metadata = [] } = content;
      const { createData } = actions;

      allMetaData = metadata;
      // tslint:disable-next-line: no-expression-statement
      createData('docs-metadata-resources.json', JSON.stringify(metadata, null, 2));
    },

    async postBuild({ outDir }) {
      // Print out to console all the rendered routes.
      fs.writeFileSync(
        path.join(outDir, 'docs-metadata-resources.json'),
        JSON.stringify(allMetaData)
      )
    },


  };
};
