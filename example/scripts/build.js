import gulp from "gulp"
import babel from "gulp-babel"
import monorepo from "../../dist/index.js"

gulp.task("build", function() {
  return gulp.src(["src/**/*"])
    .pipe(monorepo({
      scope: "@donabrams",
      filters: [
        {
          packageMatcher: "(.*)Style.{js,json}",
          dir: "__style__",
          dev: true,
        },
        {
          packageMatcher: "(.*)Test.{js}",
          dir: "__test__",
          dev: true,
        }
      ],
    }))
    .pipe(babel())
    .pipe(gulp.dest("dist"))
})
