SOLICITING API FEEDBACK: https://github.com/donabrams/gulp-monorepo/issues/1

gulp-monorepo
=============

TLDR; conventioned tool to convert a mono repo into LOTS of repos

Behavior
========
Without any config, packager will do the below:

It will look to see if there is a `package.json` next to the file or between the file and the root `package.json` (finds the nearest `package.json` that isn't the root)

If there isn't:

1. Every file will be flattened (folder nesting ignored) and put in it's own directory
2. The directory name will be the kabob-case version of the file name (assumes files names are camel case).
3. A `package.json` will be generated with keys `name` matching the directory name and `version` matching the root `package.json` `version`
4. The `dependencies` of the `package.json` file will be generated analyzing the require/imports in the file and including all non-static packages. Versions will be pulled from the nearest `package.json`. If a package is missing a dependency, an error will be thrown. Node native module are ignored unless there is a matching dependency with the same name in the nearest package.json.

If there is:

1. It rebases files relative to that nearest `package.json`
2. Determining package name: If the nearest `package.json` has a name, it uses that as the package name. Otherwise, it uses the kebab-case name of the immediate directory holding the `package.json`  as the package name (and `scope` may only applied).
3. Determining package version: If the nearest `package.json` has a version it uses that. Otherwise, it pulls the version from the root `package.json`.
4. Determining dependencies: If the nearest `package.json` has dependencies defined and one is missing for a non-dev file it will error. Otherwise it will "pull" dependencies from the root `package.json` dependencies.
5. Determining devDependencies: If the nearest `package.json` has devDependencies defined, it will error if one is missing in a dev file (marked via `filters`). Otherwise it will "pull" devDependencies from the root `package.json` devDependencies.

Example
-------

file structure:

```
 +-- gulpfile.js
 +-- package.json
 +-- src
    |-- yay.js
    |-- heyBooBoo.js
    +-- tastyThings
       |-- picnicBasket.js
       +-- YOLO.json
```

`src/yay.js`:

```
import tastyThings from 'tasty-things'
import somePackage from 'some-package'
```

`package.json`:

```
{
  "name": "my-little-mono-repo",
	"version": "1.0.1",
	"dependencies": {
		"some-package": "^4.0.1"
	}
}
```

`gulpfile.js`:

```
import gulp from 'gulp'
import monorepo from 'gulp-monorepo'

gulp.task('default', function() {
	gulp.src(["src/**/*"])
	    .pipe(monorepo())
	    .dest("dist")
})
```

After packager runs via `gulp`:

file structure of `dist` folder:

```
+-- yay
|  |-- package.json
|  +-- yay.js
+-- hey-boo-boo
|  |-- package.json
|  +-- heyBooBoo.js
+-- picnic-basket
|  |-- package.json
|  +-- picnicBasket.js
+-- y-o-l-o
   |-- package.json
   +-- YOLO.json
```

`dist/yay/package.json`:

```
{
    "name": "yay",
    "version": "1.0.1",
    "description": "generated with packager from my-little-mono-repo::yay.js",
    "dependencies": {
        "some-package": "^4.0.1",
        "tasty-things": "1.0.1"
    }
}
```

Config overrides
================

`rollBase`
----------

Defaults to `null`. If you have `plugin-a/package.json` and `plugin-a/src/yay.js` and want `yay.js` to map to `plugin-a/yay.js`, then you should set `rollBase` to `src`.

`scope`
-------
If specified, prepends the given scope onto generated package names and dir. This is v. useful for private repos (and keeping private repos private).

If modifying the example above:

`gulpfile.js`:

```
  //...
      .pipe(packager({scope:"@donabrams"}))
  //...
```

`dist/@donabrams/yay/package.json`:

```
{
    "name": "@donabrams/yay",
    "version": "1.0.1",
    "description": "generated with packager from my-little-mono-repo::yay.js",
    "dependencies": {
        "some-package": "^4.0.1",
        "tasty-things": "1.0.1"
    }
}
```

`packageKeysAllowlist`
-------------------------
Defaults to `[]`.

If non-empty, copies the given keys from the nearest `package.json` to the generated `package.json`.

`filters`
---------
Filters match the filename with a `packageMatcher` and can override the following:
 - `dir`: the `subdirectory` inside that package
 - `dev`: use `devDependencies` instead of `dependencies`. Also marks a file in a nearest `package.json` file as dev (and can then use devDependencies accordingly).
 - `main`: Defaults to `false`. If `true`, updates the generated `package.json` `main`.

A `packageMatcher` is a regex whose first capture is the camelcased package name to use.

Here's a large example of all these in action:

file structure:

```
 +-- gulpfile.js
 +-- package.json
 +-- src
    |-- yay.js
    |-- yayTest.js
    |-- yayStyle.json
    +-- tastyThings
       |-- picnicBasket.js
       +-- YOLO.json
```

`src/yay.js`:

```
import tastyThings from 'tasty-things'
import somePackage from 'some-package'
```

`src/yayTest.js`:

```
import {expect} from 'chai'

// ...
```

`package.json`:

```
{
  "name": "my-little-mono-repo",
  "version": "1.0.1",
  "dependencies": {
    "some-package": "^4.0.1"
  },
  "devDependencies": {
    "chai": "^3.5.0"
  }
}
```

`gulpfile.js`:

```
import gulp from 'gulp'
import packager from 'gulp-packager'

gulp.task('default', function() {
  gulp.src(["src/**/*"])
    .pipe(packager({
      scope: "@donabrams",
      filters: [
        {
          packageMatcher: /(.*)Style.(?:js|json)/,
          dir: "__style__",
          dev: true,
        },
        {
          packageMatcher: /(.*)Test.js/,
          dir: "__test__",
          dev: true,
        }
      ],
    }))
    .dest("dist")
})
```

After packager runs via `gulp`:

file structure of `dist/@donabrams` folder:

```
+-- yay
|  |-- package.json
|  |-- yay.js
|  |-- __tests__
|  |  +-- yayTest.js
|  +-- __style__
|     +-- yayStyle.json
+-- picnic-basket
|  |-- package.json
|  +-- picnicBasket.js
+-- y-o-l-o
   |-- package.json
   +-- YOLO.json
```

`dist/@donabrams/yay/package.json`:

```
{
    "name": "yay",
    "description": "generated with packager from my-little-mono-repo::yay.js",
    "version": "1.0.1",
    "dependencies": {
        "some-package": "^4.0.1",
        "tasty-things": "1.0.1"
    },
    "devDependencies": {
        "chai": "^3.5.0"
    }
}
```

Wishlist
========
- A way to specify description per module
- A way for a filtered file to affect the created package.json
