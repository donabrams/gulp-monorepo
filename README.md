gulp-packager 
=============

TLDR; converts a single repo into LOTS of repos

Behavior
========
Without any config, packager will do the below:

1. Every file will be flattened (folder nesting ignored) and put in it's own directory
2. The directory name will be the kabob case version of the file name (assumes files names are camel case).
3. A `package.json` will be generated with keys `name` matching the directory name and `version` matching the nearest `package.json` `version`
4. The `dependencies` of the `package.json` file will be generated analyzing the require/imports in the file and including all non-static packages. Versions will be pulled from the nearest `package.json`. If a package is missing a dependency, an error will be thrown. Node native module are ignored unless there is a matching dependency with the same name in the nearest package.json.

Example
-------

# file structure
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
# src/yay.js
```
import tastyThings from 'tasty-things'
import somePackage from 'some-package'
```
# package.json
```
{
  "name": "my-little-mono-repo",
	"version": "1.0.1",
	"dependencies": {
		"some-package": "^4.0.1"
	}
}
```
# gulpfile.js
```
import gulp from 'gulp'
import packager from 'gulp-packager'

gulp.task('default', function() {
	gulp.src(["src/**/*"])
	    .pipe(packager())
	    .dest("dist")
})
```

After packager runs via `gulp`:

# file structure of `dist` folder 
```
+-- yay
|  |-- package.json
|  +-- yay.js
+-- hey-boo-boo
|  |-- package.json
|  |-- heyBooBoo.js
+-- picnic-basket
|  |-- package.json
|  |-- picnicBasket.js
+-- y-o-l-o
   |-- package.json
   |-- YOLO.json
```
# dist/yay/package.json
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

`scope`
-------
If specified, prepends the given scope onto generated package names and dir. 

If modifying the example above:
#gulpfile.js
```
  //...
      .pipe(packager({scope:"@donabrams"}))
  //...
```
# dist/@donabrams/yay/package.json
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

`filters`
---------
Filters match the filename with a `pattern` and can override the following:
 - `package`: the `package` the file belongs in (camelCased, not kebob-cased)
 - `dir`: the `subdirectory` inside that package
 - `dev`: use `devDependencies` instead of `dependencies`

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

src/yay.js:

```
import tastyThings from 'tasty-things'
import somePackage from 'some-package'
```

src/yayTest.js:

```
import {expect} from 'chai'

// ...
```

package.json:

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

gulpfile.js:

```
import gulp from 'gulp'
import packager from 'gulp-packager'

gulp.task('default', function() {
  gulp.src(["src/**/*"])
      .pipe(packager({
        scope: "@donabrams",
        filters: [
          {
            pattern: "(.*)Style.{js,json}",
            package: "$1",
            dir: "__style__",
            dev: true,
          },
          {
            pattern: "(.*)Test.js",
            package: "$1",
            dir: "__test__",
            dev: true,
          },
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
|     +-- yayStyle.js
+-- picnic-basket
|  |-- package.json
|  |-- picnicBasket.js
+-- y-o-l-o
   |-- package.json
   |-- YOLO.json
```

dist/@donabrams/yay/package.json:

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

Important note
==============
Notice I keep saying nearest package.json. If you nest a package.json next to a file then it will be used instead of the root. This means you can override specific dependencies and versions.

Wishlist
========
- A way to specify description per module
- A way to pull specific fields from nearest package.json (such as authors, repo, coeffect deps like babel & mocha)
- A way for a filtered file to affect the created package.json
