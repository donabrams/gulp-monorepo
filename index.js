import findup from "findup-sync"
import {toLowerKebab} from "encase"
import through from "through2"
import path from "path"
import isBuiltIn from "is-builtin-module"
import detectImportRequire from "detect-import-require"
import fs from "fs"
import gutil from "gulp-util"
import _ from "lodash/fp"
import {set as mutatingSet} from "lodash"
import validatePackageName from "validate-npm-package-name"
import VinylFile from "vinyl"

function funVinylStream(pluginName, onFile, onBeforeFlush) {
  return through.obj(function gulpMonorepoStream(file, enc, consumeNext) {
    if (file.isNull() || !onFile) {
      consumeNext(null, file)
      return
    }
    if (file.isStream()) {
      consumeNext(new gutil.PluginError(pluginName, "Streaming not supported"))
      return
    }
    const {path: filePath} = file
    try {
      const toPush = onFile(file)
      if (toPush && toPush.length) {
        toPush.forEach((f)=>this.push(f))
      }
    } catch (err) {
      this.emit("error", new gutil.PluginError(pluginName, err, {
        fileName: filePath,
        showProperties: false,
      }))
    }
    consumeNext()
  },
  function(afterFlush) {
    if (onBeforeFlush) {
      try {
        const toPush = onBeforeFlush()
        if (toPush && toPush.length) {
          toPush.forEach((f)=>this.push(f))
        }
      } catch (err) {
        this.emit("error", new gutil.PluginError(pluginName, err))
      }
    }
    afterFlush()
  })
}

export default function gulpMonorepo(opts) {
  const {/*rollIntoNearest=false, rollBase=null, */packageKeysAllowlist=[], scope=null, filters=[]} = opts
  // These are memoized here instead of globally because we want to refresh them every time gulpMonorepo is called (FS changes)
  const packageNames = []
  const getPackage = _.memoize(createPackage(packageNames))
  const getNearestPackageJson = getNearestPackageJsonMemoized()
  return funVinylStream("gulp-monorepo", function onFile(file) {
    const {path: filePath, base, contents} = file
    const filter = _.find((f)=> f.packageMatcher.test(filePath), filters)
    const packageName = getPackageName({
      scope,
      filePath: filter ? filter.packageMatcher.exec(filePath)[1] : filePath,
    })
    if (!validatePackageName(packageName).validForOldPackages) {
      throw new Error(`packageName "${packageName}" is not a valid. Current packageMatcher: ${filter && filter.packageMatcher ? filter.packageMatcher : "None defined"}`)
    }
    const subdir = (filter && filter.dir) ? `${filter.dir}/` : ""
    const pathInPackage = `${subdir}${path.basename(filePath)}`
    if (isJsFile(filePath)) {
      const {pkgPath: basePackagePath, pkg: basePackage} = getNearestPackageJson(filePath)
      const pkg = getPackage(packageName, basePackage, packageKeysAllowlist)
      updatePackageJsonFromBasePackage({
        pkg,
        basePackage,
        fileContents: contents,
        isDev: filter && filter.dev,
        filePath,
        basePackagePath,
      })
      // set main if it's not a filtered file or filter says it's main
      const isMain = !filter || (filter && filter.main)
      if (isMain) {
        mutatingSet(pkg, ["main"], `./${pathInPackage}`)
      }
    }
    file.path = `${base}${packageName}/${pathInPackage}`
    return [file]
  }, function onBeforeFlush() {
    return _.compose(
      _.map(pkg=>new VinylFile({
        cwd: "",
        base: "",
        path: `${pkg.name}/package.json`,
        contents: new Buffer(JSON.stringify(pkg, null, 2)),
      })),
      // First, go through dependencies and set the versions for the other packages
      // in the monorepo. If the package still doesn't exist, this is where we error.
      _.map((pkgName) => {
        const pkg = getPackage(pkgName)
        return ["dependencies","devDependencies"]
          .reduce((__, depsKey)=> {
            if (!pkg[depsKey]) return pkg
            _.forEach((version, depName)=>{
              // Convention: If package has late resolution, version starts with "Error: "
              if (version.indexOf("Error: ") === 0) {
                // Either the package doesn't have a version defined (error) or we set it now
                if (!getPackage(depName)) {
                  throw new Error(version)
                } else {
                  pkg[depsKey][depName] = getPackage(depName).version
                }
              }
            }, pkg[depsKey])
            return pkg
          }, pkg)
      })
    )(packageNames)
  })
}

function getPackageName({filePath, scope}) {
  return (scope ? `${scope}/` : "") + toLowerKebab(fileNameWithoutExt(filePath))
}

function fileNameWithoutExt(filePath) {
  return path.basename(filePath, path.extname(filePath))
}

function getPackageNameFromRequireString(requireString) {
  const parts = requireString.split("/")
  return requireString[0] === "@" ? `${parts[0]}/${parts[1]}` : parts[0]
}

function getNearestPackageJsonMemoized() {
  const getPackageJsonPath = _.memoize(findNearestPackageJson)
  const getPackageJson = _.memoize(loadPackageJson)
  return (filePath) => {
    const pkgPath = getPackageJsonPath(path.dirname(filePath))
    const pkg = getPackageJson(pkgPath)
    return {
      pkgPath,
      pkg,
    }
  }
}

function findNearestPackageJson(dirName) {
  return findup("package.json", {cwd: dirName})
}

function loadPackageJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, {encoding: "utf8"}))
}

function createPackage(packageNames) {
  return (name, basePackage, packageKeysAllowlist=[]) => {
    packageNames.unshift(name)
    return _.pick(["name", "version", "description", ...packageKeysAllowlist], {
      ...basePackage,
      name,
      description: `generated with packager from ${basePackage.name}`,
    })
  }
}

function isJsFile(filePath) {
  return path.extname(filePath) === ".js"
}

function getDepVersion({pkg: {devDependencies={}, dependencies={}}, name, isDev}) {
  // search base package for depsKey first, but also check non-dev deps if it's a devDependency. npm crazy and devDeps kinda extend non-dev Deps.
  return _.get(name, {...(isDev ? devDependencies : {}), ...dependencies})
}

function updatePackageJsonFromBasePackage({pkg, basePackagePath, basePackage, filePath, fileContents, isDev=false}) {
  const dependencies = detectImportRequire(fileContents)
    // don't bother with relative paths
    .filter((d)=>d[0] !== ".")
    .map(getPackageNameFromRequireString)
  const depsKey = isDev ? "devDependencies" : "dependencies"
  dependencies.forEach((dep)=> {
    const version = getDepVersion({pkg: basePackage, name: dep, isDev})
    if (!version) {
      // only set an error if it's not a core node module (like fs or path).
      // Reason this isn't a filter above: some built in's (such as assert) also have npm packages. Which is kinda terrible, but ya deal with what ya have
      if (!isBuiltIn(dep)) {
        // It's possible it's another repo inside the monorepo. So don't throw here, but set an error string.
        mutatingSet(pkg, [depsKey, dep], `Error: ${isDev ? "devDependency" : "dependency"} ${dep} not in ${basePackagePath} but used in ${filePath}`)
      }
    } else {
      // TODO: There may be duplicate dependencies between dependencies and devDependencies.
      mutatingSet(pkg, [depsKey, dep], version)
    }
  })
}
