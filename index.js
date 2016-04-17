import findup from "findup-sync"
import {toLowerKebab} from "encase"
import through from "through2"
import path from "path"
import isBuiltIn from "is-builtin-module"
import detectImportRequire from "detect-import-require"
import fs from "fs"
import gutil from "gulp-util"
import _ from "lodash/fp"
import validatePackageName from "validate-npm-package-name"

export default function gulpMonorepo(opts) {
  const {/*rollIntoNearest=false, rollBase=null, */packageKeysAllowlist=[], scope=null, filters=[]} = opts
  const packagesToWriteLast = {}
  const updatePackageJsonWithFile = updatePackageJsonWithFileCached(packagesToWriteLast)
  return through.obj(function gulpMonorepoStream(file, enc, errOrFileCb) {

    if (file.isNull()) {
      errOrFileCb(null, file)
      return
    }

    if (file.isStream()) {
      errOrFileCb(new gutil.PluginError("gulp-monorepo", "Streaming not supported"))
      return
    }

    const {path: filePath, base, contents} = file
    try {
      const filter = filters.length
        ? _.find(filters, (f)=> f.packageMatcher.test(filePath))
        : null
      const packageName = getPackageName({
        scope,
        fileName: filter
          ? filter.packageMatcher.match(filePath)[1]
          : filePath,
      })
      if (!validatePackageName(packageName).validForOldPackages) {
        throw new Error(`packageName "${packageName}" is not a valid. Current packageMatcher: ${filter && filter.packageMatcher ? filter.packageMatcher : "None defined"}`)
      }
      const subdir = (filter && filter.dir)
        ? `${filter.dir}/`
        : ""
      const pathInPackage = `${subdir}${path.basename(filePath)}`
      updatePackageJsonWithFile({
        packageName,
        filePath,
        fileContents: contents,
        isDev: filter && filter.dev,
        pathInPackage,
        isMain: !filter || (filter && filter.main),
        packageKeysAllowlist,
      })
      file.path = `${base}${packageName}/${pathInPackage}`
      this.push(file)
    } catch (err) {
      this.emit("error", new gutil.PluginError("gulp-monorepo", err, {
        fileName: filePath,
        showProperties: false,
      }))
    }
    errOrFileCb()
  })
}

function getPackageName({fileName, scope}) {
  return (scope ? `${scope}/` : "") + toLowerKebab(path.basename(fileName, path.extname(fileName)))
}

function getPackageNameFromRequireString(requireString) {
  return requireString[0] === "@"
    ? requireString.substr(0, requireString.indexOf("/", requireString.indexOf("/")+1))
    : requireString.substr(0, requireString.indexOf("/"))
}

function getNearestPackageJsonWithCache() {
  const basePackageCache = {}
  return (filePath) => {
    const basePackagePath = findup("package.json", {cwd: path.dirname(filePath)})
    const basePackage = basePackageCache[basePackagePath]
      ? basePackageCache[basePackagePath]
      : (basePackageCache[basePackagePath] = JSON.parse(fs.readFileSync(basePackagePath, {encoding: "utf8"})))
    return {
      basePackagePath,
      basePackage,
    }
  }
}

function updatePackageJsonWithFileCached(packagesToWriteLast) {
  const getNearestPackageJson = getNearestPackageJsonWithCache()
  const getPackageToUpdate = ({packageName, basePackage, packageKeysAllowlist}) => {
    return packagesToWriteLast[packageName]
        ? packagesToWriteLast[packageName]
        : (packagesToWriteLast[packageName] = _.pick(basePackage, packageKeysAllowlist))
  }
  return function updatePackageJsonWithFile({packageName, filePath, fileContents, isDev=false, isMain=false, pathInPackage, packageKeysAllowlist}) {
    if (path.extname(filePath) === ".js") {
      const dependencies = detectImportRequire(fileContents)
        // don't bother with relative paths
        .filter((d)=>d[0] === ".")
        .map(getPackageNameFromRequireString)
      // just a little short circuit optimization to confuse you
      if (!dependencies.length) return
      const {basePackagePath, basePackage} = getNearestPackageJson(filePath)
      const packageToUpdate = getPackageToUpdate({packageName, basePackage, packageKeysAllowlist})
      const depsKey = isDev ? "devDependencies" : "dependencies"
      dependencies.forEach((dep)=> {
        // search base package for depsKey first, but also check non-dev deps if it's a devDependency. npm crazy and devDeps kinda extend non-dev Deps.
        const baseVersion = _.get(basePackage, [depsKey, dep], null) || (isDev && _.get(basePackage, ["dependencies", dep], null))
        if (!baseVersion) {
          // only throw an error if it's not a core node module (like fs or path). Otherwise, just don't add it.
          // Reason this isn't a filter above: some built in's (such as assert) also have npm packages. Which is kinda terrible, but ya deal with what ya have.
          if (!isBuiltIn(dep)) {
            throw new Error(`${isDev ? "devDependency" : "dependency"} ${dep} not in ${basePackagePath} but used in ${filePath}`)
          }
        } else {
          // There may be duplicate dependencies between dependencies and devDependencies. Take care of that at write time (along with sorting).
          _.set(packageToUpdate, [depsKey, dep], baseVersion)
        }
      })
      if (!isMain) {
        _.set(packageToUpdate, ["main"], `./${pathInPackage}`)
      }
    }
  }
}
