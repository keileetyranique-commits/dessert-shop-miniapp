FROM mirror.gcr.io/library/node:16.20.2-bullseye-slim AS admin
WORKDIR /src
COPY vendor/litemall/litemall-admin/ ./
COPY deploy/litemall/admin-package-lock.json ./package-lock.json
ENV VUE_APP_BASE_API=/admin
RUN npm ci --legacy-peer-deps --no-audit --no-fund
RUN npm run build

FROM mirror.gcr.io/library/maven:3.8.8-eclipse-temurin-8 AS build
WORKDIR /src
COPY vendor/litemall/ ./
COPY --from=admin /src/dist/ litemall-admin/dist/
RUN mvn -B -ntp -pl litemall-all -am package -Dmaven.test.skip=true
COPY deploy/litemall/ExtractJar.java /tmp/ExtractJar.java
RUN javac /tmp/ExtractJar.java && java -cp /tmp ExtractJar /src/litemall-all/target/litemall-all-0.1.0-exec.jar /bundle
COPY deploy/litemall/BaselineAdmin.java /tmp/BaselineAdmin.java
RUN javac -cp '/bundle/BOOT-INF/classes:/bundle/BOOT-INF/lib/*' -d /bundle /tmp/BaselineAdmin.java

FROM mirror.gcr.io/library/eclipse-temurin:8-jre-jammy
WORKDIR /app
COPY --from=build /bundle/ ./
COPY deploy/litemall/application-baseline.yml /app/config/application-baseline.yml
ENV SPRING_PROFILES_ACTIVE=db,core,admin,wx,baseline
EXPOSE 8080
CMD ["java", "-cp", ".:BOOT-INF/classes:BOOT-INF/lib/*", "org.linlinjava.litemall.Application"]
