import gulp from "gulp"
import babel from "gulp-babel"
import monorepo from "../../dist/index.js"
import gulpIf from "gulp-if"
//import debug from "gulp-debug"

gulp.task("build", function() {
  return gulp.src(["src/**/*"])
    //.pipe(debug())
    .pipe(monorepo({
      scope: "@donabrams",
      filters: [
        {
          packageMatcher: /(.*)Style.{js,json}/,
          dir: "__style__",
          dev: true,
        },
        {
          packageMatcher: /(.*)Test.{js}/,
          dir: "__test__",
          dev: true,
        }
      ],
    }))
    //.pipe(debug())
    .pipe(gulpIf("**/*.js", babel()))
    //.pipe(debug())
    .pipe(gulp.dest("dist"))
})
